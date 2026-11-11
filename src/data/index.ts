import type { Ports } from './ports';
let instance: Ports;
export async function initializeData() {
  instance = __MOCK__
    ? (await import('./mock')).createMockPorts()
    : (await import('./unconfigured')).createUnconfiguredPorts();
}
export function getData() {
  if (!instance) throw new Error('data not initialized');
  return instance;
}
