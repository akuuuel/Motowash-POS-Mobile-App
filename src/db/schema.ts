import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. Kategori & Harga Motor (Master Data + Harga + Komisi)
export const vehicleCategories = sqliteTable('vehicle_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),                  // Contoh: "Matic Kecil (BeAT, Mio)"
  price: integer('price').notNull(),             // Contoh: 15000 (disimpan dalam rupiah)
  commission: integer('commission').default(5000).notNull(), // Komisi per motor untuk jenis ini (Contoh: 8000)
  description: text('description'),
  status: text('status').default('active').notNull(), // 'active' atau 'inactive'
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 2. Data Karyawan
export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),                  // Nama karyawan
  commissionPerWash: integer('commission_per_wash').default(5000).notNull(), // Deprecated fallback
  paymentPeriod: text('payment_period').default('mingguan').notNull(),        // 'harian', 'mingguan', 'bulanan'
  status: text('status').default('active').notNull(), // 'active' atau 'inactive'
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 2b. Riwayat Penggajian & Komisi Karyawan
export const payrollPayouts = sqliteTable('payroll_payouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  payoutNumber: text('payout_number').unique().notNull(), // Format: SLIP-YYYYMMDD-XXX
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  employeeName: text('employee_name').notNull(),
  startDate: text('start_date').notNull(),  // Format YYYY-MM-DD
  endDate: text('end_date').notNull(),    // Format YYYY-MM-DD
  totalWashCount: integer('total_wash_count').notNull(),
  commissionPerWash: integer('commission_per_wash').notNull(),
  totalCommission: integer('total_commission').notNull(),
  bonus: integer('bonus').default(0).notNull(),
  deduction: integer('deduction').default(0).notNull(),
  netSalary: integer('net_salary').notNull(),
  periodType: text('period_type').notNull(), // 'harian', 'mingguan', 'bulanan', 'custom'
  breakdownJson: text('breakdown_json'),     // Rincian komisi per jenis motor (JSON)
  status: text('status').default('paid').notNull(), // 'paid' / 'pending'
  notes: text('notes'),
  paidAt: text('paid_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 3. Transaksi Pencucian Motor
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transactionNumber: text('transaction_number').unique().notNull(), // Format: KM-YYYYMMDD-XXX
  plateNumber: text('plate_number').notNull(),   // Plat nomor kendaraan (Contoh: DD 1234 AB)
  
  // Relasi ID tetap disimpan untuk referensi silang
  vehicleCategoryId: integer('vehicle_category_id').references(() => vehicleCategories.id),
  employeeId: integer('employee_id').references(() => employees.id),
  
  // DATA SNAPSHOT: Menjamin data riwayat & laporan tidak berubah meski data master dimodifikasi
  vehicleCategoryName: text('vehicle_category_name').notNull(), // Menyimpan jenis motor saat transaksi dibuat
  employeeName: text('employee_name').notNull(),               // Menyimpan nama pencuci saat transaksi dibuat
  
  originalPrice: integer('original_price').notNull(),          // Harga dasar kategori motor saat itu
  finalPrice: integer('final_price').notNull(),                // Harga final yang dibayar setelah penyesuaian manual
  commissionAmount: integer('commission_amount').default(5000).notNull(), // Snapshot komisi saat transaksi dibuat
  
  paymentMethod: text('payment_method').notNull(),             // "Tunai", "QRIS", "Transfer"
  notes: text('notes'),
  status: text('status').default('completed').notNull(),       // 'completed' atau 'cancelled'
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 4. Pembatalan Transaksi
export const transactionCancellations = sqliteTable('transaction_cancellations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transactionId: integer('transaction_id').references(() => transactions.id).notNull(),
  reason: text('reason').notNull(),              // Alasan pembatalan
  cancelledAt: text('cancelled_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 5. Pengaturan Aplikasi
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  settingKey: text('setting_key').unique().notNull(),          // Contoh: 'business_name', 'address', 'printer_mac'
  settingValue: text('setting_value').notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
