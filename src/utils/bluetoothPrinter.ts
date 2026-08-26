import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking, Alert, Platform, NativeModules, PermissionsAndroid } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  ReceiptData,
  SlipGajiData,
  buildReceiptBytes,
  buildSlipGajiBytes,
  buildTestPrintBytes,
  buildReceiptHtml,
  buildSlipGajiHtml,
  stringToBytes,
  bytesToBase64,
} from './receiptFormatter';

const { BluetoothPrinterModule } = NativeModules;

// Log status modul saat startup untuk memudahkan debugging
if (__DEV__) {
  console.log('[BT] BluetoothPrinterModule tersedia:', !!BluetoothPrinterModule);
  console.log('[BT] printRawBytes tersedia:', !!BluetoothPrinterModule?.printRawBytes);
  console.log('[BT] getPairedDevices tersedia:', !!BluetoothPrinterModule?.getPairedDevices);
}

export interface BluetoothDeviceInfo {
  name: string;
  address: string;
}

// Re-export formatter types & utilities for backward compatibility
export { ReceiptData, SlipGajiData } from './receiptFormatter';

/**
 * Request runtime Bluetooth permissions on Android
 * (Menangani izin BLUETOOTH_CONNECT & BLUETOOTH_SCAN pada Android 12+)
 */
export const requestBluetoothPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  try {
    if (Platform.Version >= 31) {
      console.log('[BT] Meminta izin Bluetooth untuk Android 12+...');
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const connectStatus = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
      console.log('[BT] BLUETOOTH_CONNECT status:', connectStatus);

      if (connectStatus !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Izin Bluetooth Diperlukan',
          'Izin Bluetooth belum diaktifkan untuk aplikasi ini. Silakan izinkan akses Bluetooth di Pengaturan HP Anda.',
          [
            { text: 'Batal', style: 'cancel' },
            { text: 'Buka Pengaturan', onPress: () => Linking.openSettings() },
          ]
        );
        return false;
      }
      return true;
    } else {
      console.log('[BT] Android < 12, meminta ACCESS_FINE_LOCATION...');
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return true;
    }
  } catch (err) {
    console.warn('[BT] Permission request error:', err);
    return true;
  }
};

/**
 * Mendapatkan Daftar Device Bluetooth Thermal yang Sudah Di-Pairing di HP
 */
export const getNativePairedDevices = async (): Promise<BluetoothDeviceInfo[]> => {
  if (Platform.OS !== 'android') return [];

  if (!BluetoothPrinterModule) {
    console.warn('[BT] BluetoothPrinterModule tidak ditemukan. Pastikan APK sudah di-rebuild setelah penambahan modul native.');
    Alert.alert(
      'Modul Printer Tidak Ditemukan',
      'Modul Bluetooth native tidak tersedia. Pastikan Anda menggunakan APK build terbaru (bukan Expo Go).'
    );
    return [];
  }

  if (!BluetoothPrinterModule.getPairedDevices) {
    console.warn('[BT] Method getPairedDevices tidak tersedia di modul.');
    return [];
  }

  const hasPerms = await requestBluetoothPermissions();
  if (!hasPerms) return [];

  try {
    console.log('[BT] Memanggil getPairedDevices...');
    const devices = await BluetoothPrinterModule.getPairedDevices();
    console.log('[BT] Perangkat paired ditemukan:', devices?.length ?? 0);
    return devices || [];
  } catch (e: any) {
    console.error('[BT] getPairedDevices error:', e);
    Alert.alert('Gagal Ambil Daftar Printer', e?.message || 'Pastikan Bluetooth aktif dan printer sudah di-pair di Pengaturan Bluetooth HP.');
  }
  return [];
};

/**
 * Membuka Halaman Pengaturan Bluetooth HP Android Secara Langsung
 */
export const openBluetoothSettings = async () => {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
    } catch (e) {
      await Linking.openSettings();
    }
  } else {
    await Linking.openSettings();
  }
};

/**
 * Membuka Halaman Pengaturan Layanan Cetak Bawaan HP Android
 */
export const openAndroidPrintSettings = async () => {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.ACTION_PRINT_SETTINGS');
    } catch (e) {
      await openBluetoothSettings();
    }
  } else {
    await Linking.openSettings();
  }
};

/**
 * Membuka Halaman Download Driver Bluetooth Printer RawBT di Play Store
 */
export const openRawBTPlayStore = () => {
  Linking.openURL('market://details?id=ru.a414.rawbt').catch(() => {
    Linking.openURL('https://play.google.com/store/apps/details?id=ru.a414.rawbt');
  });
};

/**
 * Fungsi Utama Pengiriman Byte Raw ke Native Bluetooth Module dengan Penanganan Error Ramah Pengguna
 */
/**
 * Fungsi Utama Pengiriman Byte Raw ke Native Bluetooth Module
 */
const sendToNativePrinter = async (macAddress: string, base64Data: string): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    throw new Error('Sistem cetak Bluetooth Native hanya tersedia di Android.');
  }

  if (!BluetoothPrinterModule) {
    throw new Error(
      'Modul Bluetooth native (BluetoothPrinterModule) tidak ditemukan. '
      + 'Pastikan Anda menggunakan APK build terbaru, bukan Expo Go.'
    );
  }

  if (!BluetoothPrinterModule.printRawBytes) {
    throw new Error('Method printRawBytes tidak tersedia. Rebuild APK diperlukan.');
  }

  const hasPerms = await requestBluetoothPermissions();
  if (!hasPerms) {
    throw new Error('Izin Bluetooth ditolak. Izinkan akses Bluetooth di pengaturan HP.');
  }

  try {
    console.log('[BT] Mengirim print ke MAC:', macAddress, '| Data length:', base64Data.length);
    await BluetoothPrinterModule.printRawBytes(macAddress, base64Data);
    console.log('[BT] Direct Native Print berhasil!');
    return true;
  } catch (error: any) {
    console.error('[BT] printRawBytes error - code:', error?.code, '| message:', error?.message);
    const code = error?.code || '';
    const message = error?.message || '';

    if (code === 'BLUETOOTH_DISABLED' || message.includes('Bluetooth belum dinyalakan')) {
      throw new Error('Bluetooth belum dinyalakan. Silakan aktifkan Bluetooth HP Anda.');
    }
    if (code === 'PRINTER_NOT_PAIRED' || message.includes('tidak ditemukan pada daftar')) {
      throw new Error(
        'Printer belum di-pair dengan HP ini.\n\n'
        + 'Cara pairing:\n1. Buka Pengaturan Bluetooth HP\n2. Nyalakan printer\n3. Tap nama printer untuk pair\n4. Kembali ke aplikasi dan pilih printer di Pengaturan.'
      );
    }
    if (code === 'INVALID_MAC' || message.includes('tidak valid')) {
      throw new Error('Alamat MAC printer tidak valid. Silakan pilih ulang printer di menu Pengaturan Printer.');
    }

    throw new Error(message || 'Gagal terhubung langsung ke printer thermal.');
  }
};

/**
 * Memanggil pencetakan via aplikasi driver RawBT (Intent Native atau Scheme)
 */
export const printViaRawBT = async (base64Data: string): Promise<boolean> => {
  if (Platform.OS === 'android' && BluetoothPrinterModule?.printViaRawBT) {
    try {
      await BluetoothPrinterModule.printViaRawBT(base64Data);
      return true;
    } catch (e: any) {
      console.warn('[BT] printViaRawBT error:', e);
      throw new Error(e?.message || 'Aplikasi RawBT tidak dapat dibuka. Pastikan RawBT terinstall.');
    }
  }

  try {
    const rawBtUrl = `rawbt:base64,${base64Data}`;
    await Linking.openURL(rawBtUrl);
    return true;
  } catch (err) {
    throw new Error('Aplikasi RawBT tidak terpasang di HP ini. Silakan install dari Play Store.');
  }
};

/**
 * FITUR REKOMENDASI: Tes Cetak Struk (Test Print)
 */
export const testPrintThermal = async (targetMacAddress?: string): Promise<boolean> => {
  const storeSettings = useSettingsStore.getState();
  const mac = targetMacAddress || storeSettings.printerMacAddress;
  const printMode = storeSettings.printMode || 'native';

  const rawEscPosString = buildTestPrintBytes(storeSettings.businessName);
  const bytes = stringToBytes(rawEscPosString);
  const base64Data = bytesToBase64(bytes);

  if (printMode === 'rawbt') {
    try {
      await printViaRawBT(base64Data);
      Alert.alert('Sukses Test Print', 'Struk tes berhasil dikirim ke aplikasi RawBT!');
      return true;
    } catch (e: any) {
      Alert.alert('Gagal Test Print RawBT', e.message);
      return false;
    }
  }

  if (!mac) {
    Alert.alert(
      'Printer Belum Dipilih',
      'Silakan pilih printer terlebih dahulu di menu Pengaturan Printer.'
    );
    return false;
  }

  try {
    await sendToNativePrinter(mac, base64Data);
    Alert.alert('Sukses Test Print', 'Printer berhasil terhubung dan mencetak struk tes!');
    return true;
  } catch (e: any) {
    Alert.alert(
      'Gagal Direct Test Print',
      `${e.message}\n\nIngin mencoba mencetak via RawBT?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Gunakan RawBT',
          onPress: () => {
            printViaRawBT(base64Data).catch((err) => {
              Alert.alert('Error RawBT', err.message);
            });
          },
        },
      ]
    );
    return false;
  }
};

/**
 * Mengirim berkas Struk ESC/POS ke fitur "Share via Bluetooth" Bawaan HP Android (Fallback)
 */
export const shareToBluetoothPrinter = async (data: ReceiptData) => {
  try {
    const rawEscPosString = buildReceiptBytes(data);
    const fileName = `Struk_${data.transactionNumber.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, rawEscPosString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Kirim Ke Printer Bluetooth (Fitur Bawaan HP)',
      });
    }
  } catch (error) {
    console.error('Share to Bluetooth printer error:', error);
  }
};

/**
 * Mengirim berkas Slip Gaji ESC/POS ke fitur "Share via Bluetooth" Bawaan HP Android (Fallback)
 */
export const shareSlipGajiToBluetoothPrinter = async (data: SlipGajiData) => {
  try {
    const rawEscPosString = buildSlipGajiBytes(data);
    const fileName = `SlipGaji_${data.payoutNumber.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, rawEscPosString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Kirim Ke Printer Bluetooth (Fitur Bawaan HP)',
      });
    }
  } catch (error) {
    console.error('Share to Bluetooth printer error:', error);
  }
};

/**
 * Mencetak Struk Transaksi (Mendukung Direct Bluetooth Native & Opsi RawBT)
 */
export const printReceiptThermal = async (data: ReceiptData, overrideMacAddress?: string) => {
  const rawEscPosString = buildReceiptBytes(data);
  const bytes = stringToBytes(rawEscPosString);
  const base64Data = bytesToBase64(bytes);

  const storeSettings = useSettingsStore.getState();
  const printMode = storeSettings.printMode || 'native';

  // Mode RawBT jika dipilih oleh pengguna
  if (printMode === 'rawbt') {
    try {
      await printViaRawBT(base64Data);
      return;
    } catch (e: any) {
      Alert.alert('Gagal Cetak via RawBT', e.message);
      return;
    }
  }

  let targetMac = overrideMacAddress || storeSettings.printerMacAddress;

  if (!targetMac && Platform.OS === 'android') {
    const paired = await getNativePairedDevices();
    if (paired && paired.length > 0) {
      const thermalDevice =
        paired.find((d) => /print|pos|58|thermal|goojpr|mpt|rpp|vsc|panda/i.test(d.name)) || paired[0];
      targetMac = thermalDevice.address;
    }
  }

  if (!targetMac) {
    Alert.alert(
      'Printer Belum Dipilih',
      'Silakan pilih printer terlebih dahulu di menu Pengaturan Printer.'
    );
    return;
  }

  // Mode Direct Bluetooth Native (5 Strategi Fallback)
  if (Platform.OS === 'android' && BluetoothPrinterModule?.printRawBytes) {
    try {
      await sendToNativePrinter(targetMac, base64Data);
      return;
    } catch (nativeErr: any) {
      console.log('Native Bluetooth Socket error:', nativeErr);
      if (
        nativeErr.message.includes('Bluetooth belum dinyalakan') ||
        nativeErr.message.includes('belum di-pair')
      ) {
        Alert.alert('Gagal Cetak', nativeErr.message);
        return;
      }

      // Tawarkan fallback RawBT jika direct socket tidak kompatibel dengan firmware printer
      Alert.alert(
        'Koneksi Direct Printer Gagal',
        `${nativeErr.message}\n\nApakah Anda ingin mencoba mencetak via aplikasi RawBT?`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Cetak via RawBT',
            onPress: () => {
              printViaRawBT(base64Data).catch((err) => {
                Alert.alert('Error RawBT', err.message);
              });
            },
          },
        ]
      );
      return;
    }
  }

  // Fallback System Print
  try {
    const html = buildReceiptHtml(data);
    await Print.printAsync({
      html,
      width: 164.4,
    });
  } catch (e) {
    await shareToBluetoothPrinter(data);
  }
};

/**
 * Mencetak Slip Gaji (Mendukung Direct Bluetooth Native & Opsi RawBT)
 */
export const printSlipGajiThermal = async (data: SlipGajiData, overrideMacAddress?: string) => {
  const rawEscPosString = buildSlipGajiBytes(data);
  const bytes = stringToBytes(rawEscPosString);
  const base64Data = bytesToBase64(bytes);

  const storeSettings = useSettingsStore.getState();
  const printMode = storeSettings.printMode || 'native';

  if (printMode === 'rawbt') {
    try {
      await printViaRawBT(base64Data);
      return;
    } catch (e: any) {
      Alert.alert('Gagal Cetak via RawBT', e.message);
      return;
    }
  }

  let targetMac = overrideMacAddress || storeSettings.printerMacAddress;

  if (!targetMac && Platform.OS === 'android') {
    const paired = await getNativePairedDevices();
    if (paired && paired.length > 0) {
      const thermalDevice =
        paired.find((d) => /print|pos|58|thermal|goojpr|mpt|rpp|vsc|panda/i.test(d.name)) || paired[0];
      targetMac = thermalDevice.address;
    }
  }

  if (!targetMac) {
    Alert.alert(
      'Printer Belum Dipilih',
      'Silakan pilih printer terlebih dahulu di menu Pengaturan Printer.'
    );
    return;
  }

  if (Platform.OS === 'android' && BluetoothPrinterModule?.printRawBytes) {
    try {
      await sendToNativePrinter(targetMac, base64Data);
      return;
    } catch (nativeErr: any) {
      console.log('Native Bluetooth Socket error:', nativeErr);
      if (
        nativeErr.message.includes('Bluetooth belum dinyalakan') ||
        nativeErr.message.includes('belum di-pair')
      ) {
        Alert.alert('Gagal Cetak', nativeErr.message);
        return;
      }

      Alert.alert(
        'Koneksi Direct Printer Gagal',
        `${nativeErr.message}\n\nApakah Anda ingin mencoba mencetak via aplikasi RawBT?`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Cetak via RawBT',
            onPress: () => {
              printViaRawBT(base64Data).catch((err) => {
                Alert.alert('Error RawBT', err.message);
              });
            },
          },
        ]
      );
      return;
    }
  }

  try {
    const html = buildSlipGajiHtml(data);
    await Print.printAsync({
      html,
      width: 164.4,
    });
  } catch (e) {
    await shareSlipGajiToBluetoothPrinter(data);
  }
};
