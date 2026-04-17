const Account = require('../models/Account');
const Posting = require('../models/Posting');
const LedgerTransaction = require('../models/LedgerTransaction');
const ledger = require('./ledger.service');
const { ACCOUNT_TYPES } = require('../constants');

const getBalance = async (userId) => ledger.getBalanceByType(userId, ACCOUNT_TYPES.CUSTOMER_WALLET);

const getProviderBalance = async (providerId) => ledger.getBalanceByType(providerId, ACCOUNT_TYPES.PROVIDER_WALLET);

const getProviderCommissionDebt = async (providerId) =>
  ledger.getBalanceByType(providerId, ACCOUNT_TYPES.PROVIDER_COMMISSION_DEBT);

const getUserTransactions = async (userId, { page = 1, limit = 20, type = null } = {}) => {
  const accounts = await Account.find({ ownerId: userId }).select('_id type');
  const accountIds = accounts.map((a) => a._id);

  const skip = (page - 1) * limit;

  const postings = await Posting.find({ accountId: { $in: accountIds } })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({ path: 'txId', select: 'kind narration orderId postedAt metadata' })
    .lean();

  const total = await Posting.countDocuments({ accountId: { $in: accountIds } });

  const accountTypeMap = new Map(accounts.map((a) => [a._id.toString(), a.type]));

  const items = postings
    .filter((p) => !type || (p.txId && p.txId.kind === type))
    .map((p) => ({
      _id: p._id,
      accountType: accountTypeMap.get(p.accountId.toString()),
      direction: p.direction,
      amount: p.amount,
      balanceAfter: p.balanceAfter,
      kind: p.txId?.kind,
      narration: p.txId?.narration,
      orderId: p.txId?.orderId || null,
      postedAt: p.txId?.postedAt,
      createdAt: p.createdAt,
    }));

  return { items, total };
};

module.exports = {
  getBalance,
  getProviderBalance,
  getProviderCommissionDebt,
  getUserTransactions,
};
