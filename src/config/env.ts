export const env = Object.freeze({
  cesiumIonToken: import.meta.env.VITE_CESIUM_ION_TOKEN?.trim() ?? "",
  googleMapTilesKey: import.meta.env.VITE_GOOGLE_MAP_TILES_KEY?.trim() ?? "",
});
