import { db } from './client';
import { vehicleCategories, employees, settings } from './schema';
import { sql } from 'drizzle-orm';

export const seedDatabase = async () => {
  try {
    // 0. Auto-Migration database lokal SQLite untuk penambahan kolom & tabel baru
    try {
      await db.run(sql`ALTER TABLE vehicle_categories ADD COLUMN commission INTEGER DEFAULT 5000`);
    } catch (e) {}

    try {
      await db.run(sql`ALTER TABLE transactions ADD COLUMN commission_amount INTEGER DEFAULT 5000`);
    } catch (e) {}

    try {
      await db.run(sql`ALTER TABLE payroll_payouts ADD COLUMN breakdown_json TEXT`);
    } catch (e) {}

    try {
      await db.run(sql`ALTER TABLE employees ADD COLUMN commission_per_wash INTEGER DEFAULT 5000`);
    } catch (e) {}
    try {
      await db.run(sql`ALTER TABLE employees ADD COLUMN payment_period TEXT DEFAULT 'mingguan'`);
    } catch (e) {}
    try {
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS payroll_payouts (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          payout_number TEXT UNIQUE NOT NULL,
          employee_id INTEGER NOT NULL,
          employee_name TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          total_wash_count INTEGER NOT NULL,
          commission_per_wash INTEGER NOT NULL,
          total_commission INTEGER NOT NULL,
          bonus INTEGER DEFAULT 0 NOT NULL,
          deduction INTEGER DEFAULT 0 NOT NULL,
          net_salary INTEGER NOT NULL,
          period_type TEXT NOT NULL,
          breakdown_json TEXT,
          status TEXT DEFAULT 'paid' NOT NULL,
          notes TEXT,
          paid_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
    } catch (e) {}

    // 1. Seed Tipe & Harga Motor jika kosong
    const existingCats = await db.select().from(vehicleCategories).limit(1);
    if (existingCats.length === 0) {
      await db.insert(vehicleCategories).values([
        { name: 'Matic Kecil (BeAT, Scoopy, Mio, Fazzio)', price: 15000, commission: 8000, status: 'active' },
        { name: 'Matic Besar (NMax, PCX, Aerox, ADV)', price: 20000, commission: 10000, status: 'active' },
        { name: 'Bebek (Supra, Revo, Jupiter, MX King)', price: 15000, commission: 8000, status: 'active' },
        { name: 'Motor Lanang / Sport 150cc (Vixion, CB150R)', price: 22000, commission: 10000, status: 'active' },
        { name: 'Motor Trail & Moge (CRF, KLX, 250cc+)', price: 30000, commission: 12000, status: 'active' },
      ]);
      console.log('Seeder: Kategori motor berhasil disimpan.');
    }

    // 2. Seed Data Karyawan jika kosong
    const existingEmps = await db.select().from(employees).limit(1);
    if (existingEmps.length === 0) {
      await db.insert(employees).values([
        { name: 'Budi (Cuci)', commissionPerWash: 5000, paymentPeriod: 'mingguan', status: 'active' },
        { name: 'Ahmad (Cuci)', commissionPerWash: 5000, paymentPeriod: 'mingguan', status: 'active' },
        { name: 'Rian (Cuci/Finishing)', commissionPerWash: 6000, paymentPeriod: 'bulanan', status: 'active' },
      ]);
      console.log('Seeder: Data karyawan berhasil disimpan.');
    }

    // 3. Seed Pengaturan Dasar
    const existingSettings = await db.select().from(settings).limit(1);
    if (existingSettings.length === 0) {
      await db.insert(settings).values([
        { settingKey: 'business_name', settingValue: 'Koko Motowash' },
        { settingKey: 'business_address', settingValue: 'Jl. Racing Centre No. 12, Makassar' },
        { settingKey: 'business_phone', settingValue: '081234567890' },
        { settingKey: 'thank_you_message', settingValue: 'Terima Kasih, Silakan Datang Kembali!' },
      ]);
      console.log('Seeder: Pengaturan aplikasi berhasil disimpan.');
    }
  } catch (error) {
    console.error('Gagal menjalankan seeder database:', error);
  }
};
