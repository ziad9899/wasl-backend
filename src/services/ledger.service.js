const mongoose = require('mongoose');
const Account = require('../models/Account');
const LedgerTransaction = require('../models/LedgerTransaction');
const Posting = require('../models/Posting');
const User = require('../models/User');
const { ACCOUNT_TYPES, SYSTEM_ACCOUNTS, TX_KINDS } = require('../constants');
const { ConflictError, BadRequestError, DomainError } = require('../errors');
const logger = require('../utils/logger');

const ensureSystemAccounts = async () => {
  for (const type of SYSTEM_ACCOUNTS) {
    const existing = await Account.findOne({ ownerType: 'system', type });
    if (!existing) {
      await Account.create({ ownerType: 'system', type, balance: 0 });
      logger.info(`System account created: ${type}`);
    }
  }
};

const getOrCreateUserAccount = async (userId, type, session = null) => {
  return Account.findOrCreateUserAccount(userId, type, session);
};

const postTransaction = async ({
  idempotencyKey,
  kind,
  orderId = null,
  initiatedBy = null,
  narration = '',
  entries,
  metadata = {},
}) => {
  if (!idempotencyKey) throw new BadRequestError('idempotencyKey is required');
  if (!entries || entries.length < 2) throw new BadRequestError('At least 2 entries are required');

  const existing = await LedgerTransaction.findOne({ idempotencyKey });
  if (existing) {
    const postings = await Posting.find({ txId: existing._id });
    return { transaction: existing, postings, replayed: true };
  }

  let sum = 0;
  for (const e of entries) {
    if (e.amount <= 0) throw new BadRequestError('Entry amount must be positive');
    sum += e.direction === 'DEBIT' ? -e.amount : e.amount;
  }
  if (sum !== 0) throw new DomainError('Ledger entries do not balance', 500, 'LEDGER_IMBALANCE');

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [tx] = await LedgerTransaction.create(
      [{
        idempotencyKey,
        kind,
        orderId,
        initiatedBy,
        narration,
        postedAt: new Date(),
        metadata,
      }],
      { session }
    );

    const postings = [];
    for (const entry of entries) {
      const account = await Account.findById(entry.accountId).session(session);
      if (!account) throw new DomainError(`Account ${entry.accountId} not found`, 500, 'LEDGER_ACCOUNT_MISSING');
      if (account.isLocked) throw new ConflictError(`Account ${account._id} is locked`);

      const delta = entry.direction === 'DEBIT' ? -entry.amount : entry.amount;
      const newBalance = account.balance + delta;

      const updated = await Account.findOneAndUpdate(
        { _id: account._id, version: account.version },
        { $inc: { balance: delta, version: 1 } },
        { session, new: true }
      );

      if (!updated) throw new ConflictError('Account version conflict — retry');

      const [posting] = await Posting.create(
        [{
          txId: tx._id,
          accountId: account._id,
          direction: entry.direction,
          amount: entry.amount,
          balanceAfter: newBalance,
        }],
        { session }
      );

      postings.push(posting);
    }

    await session.commitTransaction();
    return { transaction: tx, postings, replayed: false };
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      const existing2 = await LedgerTransaction.findOne({ idempotencyKey });
      if (existing2) {
        const postings = await Posting.find({ txId: existing2._id });
        return { transaction: existing2, postings, replayed: true };
      }
    }
    throw err;
  } finally {
    session.endSession();
  }
};

const payOrderFromWallet = async ({ orderId, clientId, providerId, totalHalalas, commissionHalalas, idempotencyKey }) => {
  const customerAccount = await getOrCreateUserAccount(clientId, ACCOUNT_TYPES.CUSTOMER_WALLET);
  if (customerAccount.balance < totalHalalas) {
    throw new DomainError('Insufficient wallet balance', 400, 'INSUFFICIENT_BALANCE');
  }

  const providerAccount = await getOrCreateUserAccount(providerId, ACCOUNT_TYPES.PROVIDER_WALLET);
  const platformRevenue = await Account.findSystemAccount(ACCOUNT_TYPES.PLATFORM_REVENUE);

  const payoutHalalas = totalHalalas - commissionHalalas;

  return postTransaction({
    idempotencyKey,
    kind: TX_KINDS.ORDER_PAYMENT_WALLET,
    orderId,
    initiatedBy: clientId,
    narration: `Wallet payment for order ${orderId}`,
    entries: [
      { accountId: customerAccount._id, direction: 'DEBIT', amount: totalHalalas },
      { accountId: providerAccount._id, direction: 'CREDIT', amount: payoutHalalas },
      { accountId: platformRevenue._id, direction: 'CREDIT', amount: commissionHalalas },
    ],
  });
};

const settleCashOrder = async ({ orderId, providerId, totalHalalas, commissionHalalas, idempotencyKey }) => {
  const providerAccount = await getOrCreateUserAccount(providerId, ACCOUNT_TYPES.PROVIDER_WALLET);
  const providerDebt = await getOrCreateUserAccount(providerId, ACCOUNT_TYPES.PROVIDER_COMMISSION_DEBT);
  const cashInTransit = await Account.findSystemAccount(ACCOUNT_TYPES.CASH_IN_TRANSIT);
  const platformRevenue = await Account.findSystemAccount(ACCOUNT_TYPES.PLATFORM_REVENUE);

  const payoutHalalas = totalHalalas - commissionHalalas;

  const step1 = await postTransaction({
    idempotencyKey: `${idempotencyKey}:settle`,
    kind: TX_KINDS.ORDER_SETTLEMENT_CASH,
    orderId,
    initiatedBy: providerId,
    narration: `Cash settlement for order ${orderId}`,
    entries: [
      { accountId: cashInTransit._id, direction: 'DEBIT', amount: totalHalalas },
      { accountId: providerAccount._id, direction: 'CREDIT', amount: payoutHalalas },
      { accountId: platformRevenue._id, direction: 'CREDIT', amount: commissionHalalas },
    ],
  });

  const step2 = await postTransaction({
    idempotencyKey: `${idempotencyKey}:debt`,
    kind: TX_KINDS.CASH_COMMISSION_DEBT,
    orderId,
    initiatedBy: providerId,
    narration: `Commission debt ${commissionHalalas} from cash order ${orderId}`,
    entries: [
      { accountId: providerDebt._id, direction: 'DEBIT', amount: commissionHalalas },
      { accountId: cashInTransit._id, direction: 'CREDIT', amount: commissionHalalas },
    ],
  });

  return { settlementTx: step1.transaction, debtTx: step2.transaction };
};

const topupWalletFromGateway = async ({ userId, amountHalalas, gatewayRef, idempotencyKey }) => {
  const userWallet = await getOrCreateUserAccount(userId, ACCOUNT_TYPES.CUSTOMER_WALLET);
  const clearing = await Account.findSystemAccount(ACCOUNT_TYPES.PAYMENT_GATEWAY_CLEARING);

  return postTransaction({
    idempotencyKey,
    kind: TX_KINDS.WALLET_TOPUP,
    initiatedBy: userId,
    narration: `Wallet topup via ${gatewayRef}`,
    metadata: { gatewayRef },
    entries: [
      { accountId: clearing._id, direction: 'DEBIT', amount: amountHalalas },
      { accountId: userWallet._id, direction: 'CREDIT', amount: amountHalalas },
    ],
  });
};

const processWithdrawalDebit = async ({ providerId, amountHalalas, idempotencyKey, externalRef }) => {
  const providerWallet = await getOrCreateUserAccount(providerId, ACCOUNT_TYPES.PROVIDER_WALLET);
  if (providerWallet.balance < amountHalalas) {
    throw new DomainError('Insufficient provider wallet balance', 400, 'INSUFFICIENT_BALANCE');
  }
  const payoutPending = await Account.findSystemAccount(ACCOUNT_TYPES.PAYOUT_PENDING);

  return postTransaction({
    idempotencyKey,
    kind: TX_KINDS.WITHDRAWAL_REQUEST,
    initiatedBy: providerId,
    narration: `Withdrawal requested, ref: ${externalRef || 'pending'}`,
    entries: [
      { accountId: providerWallet._id, direction: 'DEBIT', amount: amountHalalas },
      { accountId: payoutPending._id, direction: 'CREDIT', amount: amountHalalas },
    ],
  });
};

const completeWithdrawalPayout = async ({ amountHalalas, externalRef, idempotencyKey }) => {
  const payoutPending = await Account.findSystemAccount(ACCOUNT_TYPES.PAYOUT_PENDING);
  const clearing = await Account.findSystemAccount(ACCOUNT_TYPES.PAYMENT_GATEWAY_CLEARING);

  return postTransaction({
    idempotencyKey,
    kind: TX_KINDS.WITHDRAWAL_PAID,
    narration: `Withdrawal paid, ref: ${externalRef}`,
    metadata: { externalRef },
    entries: [
      { accountId: payoutPending._id, direction: 'DEBIT', amount: amountHalalas },
      { accountId: clearing._id, direction: 'CREDIT', amount: amountHalalas },
    ],
  });
};

const rejectWithdrawal = async ({ providerId, amountHalalas, idempotencyKey, reason }) => {
  const providerWallet = await getOrCreateUserAccount(providerId, ACCOUNT_TYPES.PROVIDER_WALLET);
  const payoutPending = await Account.findSystemAccount(ACCOUNT_TYPES.PAYOUT_PENDING);

  return postTransaction({
    idempotencyKey,
    kind: TX_KINDS.WITHDRAWAL_REJECTED,
    initiatedBy: providerId,
    narration: `Withdrawal rejected: ${reason || 'no reason'}`,
    entries: [
      { accountId: payoutPending._id, direction: 'DEBIT', amount: amountHalalas },
      { accountId: providerWallet._id, direction: 'CREDIT', amount: amountHalalas },
    ],
  });
};

const refundOrder = async ({ orderId, clientId, amountHalalas, idempotencyKey, reason }) => {
  const customerWallet = await getOrCreateUserAccount(clientId, ACCOUNT_TYPES.CUSTOMER_WALLET);
  const refunds = await Account.findSystemAccount(ACCOUNT_TYPES.PLATFORM_REFUNDS);

  return postTransaction({
    idempotencyKey,
    kind: TX_KINDS.REFUND,
    orderId,
    narration: `Refund: ${reason || 'admin'}`,
    entries: [
      { accountId: refunds._id, direction: 'DEBIT', amount: amountHalalas },
      { accountId: customerWallet._id, direction: 'CREDIT', amount: amountHalalas },
    ],
  });
};

const applyReferralBonus = async ({ referrerId, amountHalalas, idempotencyKey }) => {
  const referrerWallet = await getOrCreateUserAccount(referrerId, ACCOUNT_TYPES.CUSTOMER_WALLET);
  const pool = await Account.findSystemAccount(ACCOUNT_TYPES.REFERRAL_BONUS_POOL);

  return postTransaction({
    idempotencyKey,
    kind: TX_KINDS.REFERRAL_BONUS,
    initiatedBy: referrerId,
    narration: `Referral bonus`,
    entries: [
      { accountId: pool._id, direction: 'DEBIT', amount: amountHalalas },
      { accountId: referrerWallet._id, direction: 'CREDIT', amount: amountHalalas },
    ],
  });
};

const getBalanceByType = async (userId, accountType) => {
  const account = await Account.findOne({ ownerId: userId, type: accountType });
  return account ? account.balance : 0;
};

const reconcile = async () => {
  const accounts = await Account.find();
  let totalSystemBalance = 0;
  const imbalances = [];

  for (const acc of accounts) {
    const postings = await Posting.find({ accountId: acc._id });
    let computed = 0;
    for (const p of postings) {
      computed += p.direction === 'DEBIT' ? -p.amount : p.amount;
    }
    if (computed !== acc.balance) {
      imbalances.push({
        accountId: acc._id,
        type: acc.type,
        stored: acc.balance,
        computed,
        diff: acc.balance - computed,
      });
    }
    totalSystemBalance += acc.balance;
  }

  return {
    healthy: imbalances.length === 0 && totalSystemBalance === 0,
    totalSystemBalance,
    imbalances,
    accountCount: accounts.length,
  };
};

module.exports = {
  ensureSystemAccounts,
  getOrCreateUserAccount,
  postTransaction,
  payOrderFromWallet,
  settleCashOrder,
  topupWalletFromGateway,
  processWithdrawalDebit,
  completeWithdrawalPayout,
  rejectWithdrawal,
  refundOrder,
  applyReferralBonus,
  getBalanceByType,
  reconcile,
};
