import { create } from 'zustand';
import { db } from '../db/client';
import { transactions, vehicleCategories, employees } from '../db/schema';
import { desc, like, eq } from 'drizzle-orm';

interface TransactionForm {
  plateNumber: string;
  vehicleCategoryId: number | null;
  employeeId: number | null;
  originalPrice: number;
  finalPrice: number;
  paymentMethod: string;
  notes: string;
}

interface TransactionState {
  // Form State
  form: TransactionForm;
  
  // Actions
  setPlateNumber: (plate: string) => void;
  selectCategory: (categoryId: number, categoryName: string, price: number) => void;
  selectEmployee: (employeeId: number) => void;
  setFinalPrice: (price: number) => void;
  setPaymentMethod: (method: string) => void;
  setNotes: (notes: string) => void;
  resetForm: () => void;
  
  // Database Operations
  saveTransaction: () => Promise<typeof transactions.$inferSelect>;
}

const initialForm: TransactionForm = {
  plateNumber: '',
  vehicleCategoryId: null,
  employeeId: null,
  originalPrice: 0,
  finalPrice: 0,
  paymentMethod: 'Tunai',
  notes: '',
};

export const useTransactionStore = create<TransactionState>((set, get) => ({
  form: { ...initialForm },

  setPlateNumber: (plate) => set((state) => ({ 
    form: { ...state.form, plateNumber: plate.toUpperCase() } 
  })),

  selectCategory: (categoryId, categoryName, price) => set((state) => ({
    form: { 
      ...state.form, 
      vehicleCategoryId: categoryId, 
      originalPrice: price, 
      finalPrice: price // Default final price to original price
    }
  })),

  selectEmployee: (employeeId) => set((state) => ({
    form: { ...state.form, employeeId }
  })),

  setFinalPrice: (price) => set((state) => ({
    form: { ...state.form, finalPrice: price }
  })),

  setPaymentMethod: (method) => set((state) => ({
    form: { ...state.form, paymentMethod: method }
  })),

  setNotes: (notes) => set((state) => ({
    form: { ...state.form, notes }
  })),

  resetForm: () => set({ form: { ...initialForm } }),

  saveTransaction: async () => {
    const { form } = get();
    
    // Validasi input
    if (!form.plateNumber.trim()) throw new Error('Nomor plat motor tidak boleh kosong.');
    if (!form.vehicleCategoryId) throw new Error('Jenis motor belum dipilih.');
    if (!form.employeeId) throw new Error('Karyawan yang mencuci belum dipilih.');

    // 1. Dapatkan Detail Kategori & Karyawan (untuk Snapshot)
    const [category] = await db.select().from(vehicleCategories).where(eq(vehicleCategories.id, form.vehicleCategoryId)).limit(1);
    const [employee] = await db.select().from(employees).where(eq(employees.id, form.employeeId)).limit(1);

    if (!category) throw new Error('Kategori motor tidak valid.');
    if (!employee) throw new Error('Data karyawan tidak valid.');

    // 2. Generate Nomor Transaksi Unik Offline (KM-YYYYMMDD-XXX)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const prefix = `KM-${dateStr}-`;

    const lastTx = await db.select({
      transactionNumber: transactions.transactionNumber
    })
    .from(transactions)
    .where(like(transactions.transactionNumber, `${prefix}%`))
    .orderBy(desc(transactions.id))
    .limit(1);

    let nextSeq = 1;
    if (lastTx.length > 0) {
      const parts = lastTx[0].transactionNumber.split('-');
      const seqStr = parts[parts.length - 1];
      const seqVal = parseInt(seqStr, 10);
      if (!isNaN(seqVal)) {
        nextSeq = seqVal + 1;
      }
    }
    const seqPadded = String(nextSeq).padStart(3, '0');
    const txNumber = `${prefix}${seqPadded}`;

    // 3. Simpan Ke Database SQLite menggunakan Drizzle
    const [newTx] = await db.insert(transactions).values({
      transactionNumber: txNumber,
      plateNumber: form.plateNumber.trim(),
      vehicleCategoryId: form.vehicleCategoryId,
      employeeId: form.employeeId,
      vehicleCategoryName: category.name,
      employeeName: employee.name,
      originalPrice: form.originalPrice,
      finalPrice: form.finalPrice,
      // PERBAIKAN: Gunakan tipe yang benar dari skema Drizzle (bukan 'as any')
      // Fallback ke 0 (bukan 5000) agar tidak ada angka ajaib yang menyesatkan
      commissionAmount: category.commission ?? 0,
      paymentMethod: form.paymentMethod,
      notes: form.notes,
      status: 'completed',
    }).returning();

    // 4. Reset Form & Return Transaksi yang Berhasil
    set({ form: { ...initialForm } });
    return newTx;
  },
}));
