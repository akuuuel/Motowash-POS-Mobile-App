import { create } from 'zustand';
import { db } from '../db/client';
import { vehicleCategories, employees } from '../db/schema';
import { eq } from 'drizzle-orm';

interface MasterState {
  categories: Array<typeof vehicleCategories.$inferSelect>;
  employees: Array<typeof employees.$inferSelect>;
  isLoading: boolean;
  fetchCategories: () => Promise<void>;
  fetchEmployees: () => Promise<void>;
  loadAll: () => Promise<void>;
}

export const useMasterStore = create<MasterState>((set) => ({
  categories: [],
  employees: [],
  isLoading: false,
  fetchCategories: async () => {
    try {
      const data = await db.select().from(vehicleCategories).where(eq(vehicleCategories.status, 'active'));
      set({ categories: data });
    } catch (e) {
      console.error('Failed to fetch categories:', e);
    }
  },
  fetchEmployees: async () => {
    try {
      const data = await db.select().from(employees).where(eq(employees.status, 'active'));
      set({ employees: data });
    } catch (e) {
      console.error('Failed to fetch employees:', e);
    }
  },
  loadAll: async () => {
    set({ isLoading: true });
    try {
      // PERBAIKAN: Filter 'active' langsung di SQL, konsisten dengan fetchCategories() & fetchEmployees()
      const [cats, emps] = await Promise.all([
        db.select().from(vehicleCategories).where(eq(vehicleCategories.status, 'active')),
        db.select().from(employees).where(eq(employees.status, 'active')),
      ]);
      set({ categories: cats, employees: emps });
    } catch (e) {
      console.error('Failed to load master data:', e);
    } finally {
      set({ isLoading: false });
    }
  },
}));
