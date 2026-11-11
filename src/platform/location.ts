export type LocationResult =
  | { state: 'not-required' | 'denied' | 'timeout' | 'unavailable' | 'cancelled' }
  | { state: 'success'; coords: { longitude: number; latitude: number; accuracy: number } };
export class LocationAdapter {
  private epoch = 0;
  private cancelPending?: () => void;
  cancel() {
    this.epoch++;
    this.cancelPending?.();
    this.cancelPending = undefined;
  }
  async get(required: boolean): Promise<LocationResult> {
    this.cancel();
    if (!required) return { state: 'not-required' };
    if (!navigator.geolocation || !globalThis.isSecureContext) return { state: 'unavailable' };
    const id = this.epoch;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: LocationResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.cancelPending = undefined;
        resolve(result);
      };
      const timer = setTimeout(() => finish({ state: 'timeout' }), 8000);
      this.cancelPending = () => finish({ state: 'cancelled' });
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (id !== this.epoch) return finish({ state: 'cancelled' });
          const { longitude, latitude, accuracy } = p.coords;
          if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(accuracy) ||
            Math.abs(longitude) > 180 ||
            Math.abs(latitude) > 90 ||
            accuracy < 0
          )
            return finish({ state: 'unavailable' });
          finish({
            state: 'success',
            coords: {
              longitude: Number(longitude.toFixed(7)),
              latitude: Number(latitude.toFixed(7)),
              accuracy: Number(accuracy.toFixed(2)),
            },
          });
        },
        (error) =>
          finish({
            state:
              id !== this.epoch
                ? 'cancelled'
                : error.code === 1
                  ? 'denied'
                  : error.code === 3
                    ? 'timeout'
                    : 'unavailable',
          }),
        { timeout: 8000, maximumAge: 0, enableHighAccuracy: true },
      );
    });
  }
}
