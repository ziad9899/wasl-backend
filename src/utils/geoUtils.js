const toGeoJSON = ({ lat, lng }) => ({
  type: 'Point',
  coordinates: [parseFloat(lng), parseFloat(lat)],
});

const toLatLng = (geoPoint) => ({
  lat: geoPoint.coordinates[1],
  lng: geoPoint.coordinates[0],
});

const kmToMeters = (km) => km * 1000;

module.exports = { toGeoJSON, toLatLng, kmToMeters };