import type { Ports } from './ports';
let instance: Ports;
export async function initializeData(onIdentityChange = () => {}) {
  instance = __MOCK__
    ? (await import('./mock')).createMockPorts()
    : __H5__
      ? (await import('./h5')).createH5Ports(onIdentityChange)
      : (await import('./unconfigured')).createUnconfiguredPorts();
}
export function getData() {
  if (!instance) throw new Error('data not initialized');
  return instance;
}
