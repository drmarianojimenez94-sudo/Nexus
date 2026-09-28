/**
 * Web Bluetooth isn't part of TypeScript's standard DOM lib (and never
 * will be for Safari/iOS — Apple doesn't implement it). This declares
 * only the handful of members NexusBluetoothPanel actually uses.
 * See docs/NEXUS_CONNECTORS.md for why this is a "best effort" panel,
 * not the primary path to smart-home control.
 */
interface BluetoothDevice {
  id: string;
  name?: string;
}

interface BluetoothRequestDeviceOptions {
  acceptAllDevices?: boolean;
  optionalServices?: string[];
}

interface Bluetooth {
  requestDevice(options?: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  bluetooth?: Bluetooth;
}
