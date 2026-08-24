import { create } from 'zustand';
import { db } from '../db/client';
import { settings } from '../db/schema';
import { eq } from 'drizzle-orm';

interface SettingsState {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  thankYouMessage: string;
  printerMacAddress: string;
  printerName: string;
  payrollPeriod: 'harian' | 'mingguan' | 'bulanan';
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
  updateSettings: (vals: Record<string, string>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  businessName: 'Koko Motowash',
  businessAddress: 'Jl. Racing Centre No. 12',
  businessPhone: '081234567890',
  thankYouMessage: 'Terima Kasih, Silakan Datang Kembali!',
  printerMacAddress: '',
  printerName: '',
  payrollPeriod: 'mingguan',
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const data = await db.select().from(settings);
      const config: Record<string, string> = {};
      data.forEach((item) => {
        config[item.settingKey] = item.settingValue;
      });

      set({
        businessName: config['business_name'] || 'Koko Motowash',
        businessAddress: config['business_address'] || 'Jl. Racing Centre No. 12',
        businessPhone: config['business_phone'] || '081234567890',
        thankYouMessage: config['thank_you_message'] || 'Terima Kasih, Silakan Datang Kembali!',
        printerMacAddress: config['printer_mac_address'] || '',
        printerName: config['printer_name'] || '',
        payrollPeriod: (config['payroll_period'] as any) || 'mingguan',
      });
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  updateSetting: async (key, value) => {
    try {
      // Periksa apakah data sudah ada
      const existing = await db.select().from(settings).where(eq(settings.settingKey, key)).limit(1);
      if (existing.length > 0) {
        await db.update(settings).set({ settingValue: value }).where(eq(settings.settingKey, key));
      } else {
        await db.insert(settings).values({ settingKey: key, settingValue: value });
      }

      // Sync state
      const stateUpdate: Partial<SettingsState> = {};
      if (key === 'business_name') stateUpdate.businessName = value;
      if (key === 'business_address') stateUpdate.businessAddress = value;
      if (key === 'business_phone') stateUpdate.businessPhone = value;
      if (key === 'thank_you_message') stateUpdate.thankYouMessage = value;
      if (key === 'printer_mac_address') stateUpdate.printerMacAddress = value;
      if (key === 'printer_name') stateUpdate.printerName = value;
      if (key === 'payroll_period') stateUpdate.payrollPeriod = value as any;

      set(stateUpdate);
    } catch (e) {
      console.error(`Failed to update setting ${key}:`, e);
      throw e;
    }
  },

  updateSettings: async (vals) => {
    try {
      for (const [key, value] of Object.entries(vals)) {
        const existing = await db.select().from(settings).where(eq(settings.settingKey, key)).limit(1);
        if (existing.length > 0) {
          await db.update(settings).set({ settingValue: value }).where(eq(settings.settingKey, key));
        } else {
          await db.insert(settings).values({ settingKey: key, settingValue: value });
        }
      }

      // Reload all settings to keep state in sync
      const data = await db.select().from(settings);
      const config: Record<string, string> = {};
      data.forEach((item) => {
        config[item.settingKey] = item.settingValue;
      });

      set({
        businessName: config['business_name'] || 'Koko Motowash',
        businessAddress: config['business_address'] || 'Jl. Racing Centre No. 12',
        businessPhone: config['business_phone'] || '081234567890',
        thankYouMessage: config['thank_you_message'] || 'Terima Kasih, Silakan Datang Kembali!',
        printerMacAddress: config['printer_mac_address'] || '',
        printerName: config['printer_name'] || '',
        payrollPeriod: (config['payroll_period'] as any) || 'mingguan',
      });
    } catch (e) {
      console.error('Failed to update settings batch:', e);
      throw e;
    }
  }
}));
