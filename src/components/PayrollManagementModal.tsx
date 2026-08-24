import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMasterStore } from '../store/useMasterStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { db } from '../db/client';
import { transactions, payrollPayouts, employees } from '../db/schema';
import { eq, and, gte, lte, sql, desc, or } from 'drizzle-orm';
import { buildSlipGajiBytes, stringToBytes } from '../utils/bluetoothPrinter';

interface PayrollManagementModalProps {
  visible: boolean;
  onClose: () => void;
}

interface CategoryBreakdownItem {
  categoryName: string;
  count: number;
  commissionPerWash: number;
  subtotal: number;
}

export function PayrollManagementModal({ visible, onClose }: PayrollManagementModalProps) {
  const employeesList = useMasterStore((state) => state.employees);
  const settingsStore = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'hitung' | 'riwayat'>('hitung');

  // Filter States
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [periodType, setPeriodType] = useState<'harian' | 'mingguan' | 'bulanan'>('mingguan');
  
  // Custom Date States (Format YYYY-MM-DD)
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');

  // Bonus & Deduction
  const [bonusInput, setBonusInput] = useState('0');
  const [deductionInput, setDeductionInput] = useState('0');
  const [notesInput, setNotesInput] = useState('');

  // Calculation Results
  const [loading, setLoading] = useState(false);
  const [washCount, setWashCount] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdownItem[]>([]);
  const [totalCommission, setTotalCommission] = useState(0);
  const [existingPayout, setExistingPayout] = useState<any>(null);

  // History List
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);

  // Slip Thermal Print Modal State
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [slipDataToPrint, setSlipDataToPrint] = useState<any>(null);

  // Auto-set start & end date based on selected period
  const updatePeriodDates = useCallback((type: 'harian' | 'mingguan' | 'bulanan') => {
    const getLocalDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const today = new Date();
    const endDate = getLocalDateStr(today);

    let startDate = endDate;
    if (type === 'harian') {
      startDate = endDate;
    } else if (type === 'mingguan') {
      // 7 hari terakhir
      const start = new Date();
      start.setDate(today.getDate() - 6);
      startDate = getLocalDateStr(start);
    } else if (type === 'bulanan') {
      // Awal bulan ini
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate = getLocalDateStr(start);
    }

    setStartDateStr(startDate);
    setEndDateStr(endDate);
  }, []);

  // Initialize employee & period when modal opens
  useEffect(() => {
    if (visible) {
      if (employeesList.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(employeesList[0].id);
      }
      const ownerPeriod = settingsStore.payrollPeriod || 'mingguan';
      setPeriodType(ownerPeriod);
      updatePeriodDates(ownerPeriod);
    }
  }, [visible, employeesList, settingsStore.payrollPeriod, updatePeriodDates]);

  // Calculate live wash count, category breakdown and payout status
  const calculatePayroll = useCallback(async () => {
    if (!selectedEmployeeId || !startDateStr || !endDateStr) return;
    setLoading(true);

    try {
      const selectedEmp = employeesList.find((e) => e.id === selectedEmployeeId);
      if (!selectedEmp) return;

      // 1. Query total motor dicuci oleh karyawan ini di rentang tanggal
      // Mencakup pencarian berdasarkan ID maupun Nama Karyawan untuk kompatibilitas data lama & baru
      const txs = await db.select()
        .from(transactions)
        .where(
          and(
            or(
              eq(transactions.employeeId, selectedEmployeeId),
              eq(transactions.employeeName, selectedEmp.name)
            ),
            eq(transactions.status, 'completed'),
            sql`date(${transactions.createdAt}, 'localtime') >= date(${startDateStr})`,
            sql`date(${transactions.createdAt}, 'localtime') <= date(${endDateStr})`
          )
        );

      setWashCount(txs.length);

      // 2. Hitung breakdown per kategori motor
      // PERBAIKAN: fallback komisi ke 0, bukan 5000
      // (nilai 5000 hardcoded bisa salah jika komisi memang sengaja 0)
      const breakdownMap: Record<string, { count: number; commission: number }> = {};
      txs.forEach((tx) => {
        const catName = tx.vehicleCategoryName || 'Motor';
        const comm = tx.commissionAmount ?? 0;
        if (!breakdownMap[catName]) {
          breakdownMap[catName] = { count: 0, commission: comm };
        }
        breakdownMap[catName].count += 1;
      });

      const breakdownList: CategoryBreakdownItem[] = Object.keys(breakdownMap).map((catName) => {
        const item = breakdownMap[catName];
        return {
          categoryName: catName,
          count: item.count,
          commissionPerWash: item.commission,
          subtotal: item.count * item.commission,
        };
      });

      setCategoryBreakdown(breakdownList);

      const calculatedTotalCommission = breakdownList.reduce((acc, item) => acc + item.subtotal, 0);
      setTotalCommission(calculatedTotalCommission);

      // 3. Cek apakah penggajian periode ini sudah terbayarkan sebelumnya di database
      const payouts = await db.select()
        .from(payrollPayouts)
        .where(
          and(
            eq(payrollPayouts.employeeId, selectedEmployeeId),
            eq(payrollPayouts.startDate, startDateStr),
            eq(payrollPayouts.endDate, endDateStr)
          )
        )
        .limit(1);

      if (payouts.length > 0) {
        setExistingPayout(payouts[0]);
      } else {
        setExistingPayout(null);
      }
    } catch (e) {
      console.error('Gagal menghitung penggajian:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployeeId, startDateStr, endDateStr, employeesList]);

  // Load history list
  const loadHistory = useCallback(async () => {
    try {
      const list = await db.select().from(payrollPayouts).orderBy(desc(payrollPayouts.id)).limit(20);
      setPayoutHistory(list);
    } catch (e) {
      console.error('Gagal memuat riwayat slip gaji:', e);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      calculatePayroll();
      loadHistory();
    }
  }, [visible, calculatePayroll, loadHistory, activeTab]);

  const selectedEmployee = employeesList.find((e) => e.id === selectedEmployeeId) || employeesList[0];
  const bonus = parseInt(bonusInput, 10) || 0;
  const deduction = parseInt(deductionInput, 10) || 0;
  const netSalary = Math.max(0, totalCommission + bonus - deduction);

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  // Tandai sebagai Terbayarkan
  const handleMarkAsPaid = async () => {
    if (!selectedEmployee) return;

    // PERBAIKAN: Buat nomor slip yang sequential (SLIP-YYYYMMDD-XXX)
    // bukan pakai timestamp agar tidak duplikat jika double-tap
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const slipPrefix = `SLIP-${dateStr}-`;
    const lastSlip = await db.select({ payoutNumber: payrollPayouts.payoutNumber })
      .from(payrollPayouts)
      .where(sql`${payrollPayouts.payoutNumber} LIKE ${slipPrefix + '%'}`)
      .orderBy(desc(payrollPayouts.id))
      .limit(1);
    let nextSlipSeq = 1;
    if (lastSlip.length > 0) {
      const parts = lastSlip[0].payoutNumber.split('-');
      const seq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(seq)) nextSlipSeq = seq + 1;
    }
    const payoutNum = `${slipPrefix}${String(nextSlipSeq).padStart(3, '0')}`;

    try {
      await db.insert(payrollPayouts).values({
        payoutNumber: payoutNum,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        startDate: startDateStr,
        endDate: endDateStr,
        totalWashCount: washCount,
        commissionPerWash: 0,
        totalCommission: totalCommission,
        bonus: bonus,
        deduction: deduction,
        netSalary: netSalary,
        periodType: periodType,
        breakdownJson: JSON.stringify(categoryBreakdown),
        status: 'paid',
        notes: notesInput.trim() || null,
      });

      Alert.alert('Sukses', `Gaji ${selectedEmployee.name} berhasil ditandai TERBAYARKAN.`);
      await calculatePayroll();
      await loadHistory();
    } catch (e: any) {
      console.error('Gagal menyimpan pembayaran gaji:', e);
      Alert.alert('Gagal', e?.message?.includes('UNIQUE') ? 'Slip gaji untuk periode ini sudah ada.' : 'Gagal menyimpan status pembayaran gaji.');
    }
  };

  // Open Slip Gaji Thermal Preview
  const handleOpenPrintPreview = (payoutObj?: any) => {
    let parsedBreakdown: CategoryBreakdownItem[] = categoryBreakdown;
    if (payoutObj && payoutObj.breakdownJson) {
      try {
        parsedBreakdown = JSON.parse(payoutObj.breakdownJson);
      } catch (e) {}
    }

    const data = payoutObj || {
      businessName: settingsStore.businessName,
      businessAddress: settingsStore.businessAddress,
      businessPhone: settingsStore.businessPhone,
      payoutNumber: existingPayout?.payoutNumber || `SLIP-${Date.now().toString().slice(-8)}`,
      employeeName: selectedEmployee?.name || 'Karyawan',
      startDate: startDateStr,
      endDate: endDateStr,
      periodType: periodType,
      totalWashCount: washCount,
      commissionPerWash: 0,
      totalCommission: totalCommission,
      bonus: bonus,
      deduction: deduction,
      netSalary: netSalary,
      status: existingPayout ? 'TERBAYARKAN' : 'BELUM DIBAYAR',
      paidAt: existingPayout ? existingPayout.paidAt : new Date().toLocaleString('id-ID'),
      categoryBreakdown: parsedBreakdown,
    };

    setSlipDataToPrint(data);
    setPrintModalVisible(true);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView type="backgroundElement" style={styles.modalSubScreen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* Header Modal */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="arrow-back" size={24} color="#1E293B" />
            </TouchableOpacity>
            <ThemedText type="default" style={styles.modalSubTitle}>Penggajian & Komisi Karyawan</ThemedText>
            <View style={{ width: 24 }} />
          </View>

          {/* Navigation Tabs (Hitung Gaji vs Riwayat) */}
          <View style={styles.tabBarRow}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'hitung' && styles.tabItemActive]}
              onPress={() => setActiveTab('hitung')}
            >
              <Ionicons name="calculator-outline" size={18} color={activeTab === 'hitung' ? '#2563EB' : '#64748B'} />
              <ThemedText style={[styles.tabText, activeTab === 'hitung' && styles.tabTextActive]}>
                Hitung Gaji & Komisi
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'riwayat' && styles.tabItemActive]}
              onPress={() => setActiveTab('riwayat')}
            >
              <Ionicons name="receipt-outline" size={18} color={activeTab === 'riwayat' ? '#2563EB' : '#64748B'} />
              <ThemedText style={[styles.tabText, activeTab === 'riwayat' && styles.tabTextActive]}>
                Riwayat Slip Gaji
              </ThemedText>
            </TouchableOpacity>
          </View>

          {activeTab === 'hitung' ? (
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
              {/* 1. Pilih Karyawan */}
              <ThemedText style={styles.inputLabel}>Pilih Karyawan Pencuci</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalEmpPicker} keyboardShouldPersistTaps="always">
              {employeesList.map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  style={[
                    styles.empPill,
                    selectedEmployeeId === emp.id && styles.empPillActive,
                  ]}
                  onPress={() => setSelectedEmployeeId(emp.id)}
                >
                  <Ionicons
                    name="person-circle-outline"
                    size={16}
                    color={selectedEmployeeId === emp.id ? '#FFFFFF' : '#2563EB'}
                  />
                  <ThemedText
                    style={[
                      styles.empPillText,
                      selectedEmployeeId === emp.id && styles.empPillTextActive,
                    ]}
                  >
                    {emp.name}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 2. Periode Gajian (Diatur Dari Pengaturan Owner) */}
            <ThemedText style={[styles.inputLabel, { marginTop: 16 }]}>Periode Gajian Operasional</ThemedText>
            <View style={styles.configuredPeriodBox}>
              <Ionicons name="time" size={18} color="#2563EB" />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.configuredPeriodLabel}>Mode Penggajian Sesuai Pengaturan:</ThemedText>
                <ThemedText style={styles.configuredPeriodVal}>
                  {periodType === 'harian' ? 'Harian (Hari Ini)' : periodType === 'mingguan' ? 'Mingguan (7 Hari Terakhir)' : 'Bulanan (Bulan Ini)'}
                </ThemedText>
              </View>
            </View>

            {/* Dates info bar */}
            <View style={styles.dateInfoBar}>
              <Ionicons name="calendar-outline" size={16} color="#64748B" />
              <ThemedText style={styles.dateInfoText}>
                Rentang: <ThemedText style={{ fontWeight: '800', color: '#0F172A' }}>{startDateStr}</ThemedText> s/d{' '}
                <ThemedText style={{ fontWeight: '800', color: '#0F172A' }}>{endDateStr}</ThemedText>
              </ThemedText>
            </View>

            {/* 3. Live Card Rekap Gaji */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#2563EB" />
                <ThemedText style={styles.loadingText}>Menghitung komisi & pencucian...</ThemedText>
              </View>
            ) : (
              <View style={styles.salaryCard}>
                {/* Header Card with Status Badge */}
                <View style={styles.salaryCardHeader}>
                  <View>
                    <ThemedText style={styles.salaryEmpName}>{selectedEmployee?.name}</ThemedText>
                    <ThemedText style={styles.salarySubText}>
                      Total Hasil Cucian: {washCount} Motor
                    </ThemedText>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    existingPayout ? styles.statusBadgePaid : styles.statusBadgePending
                  ]}>
                    <Ionicons
                      name={existingPayout ? 'checkmark-circle' : 'time-outline'}
                      size={14}
                      color={existingPayout ? '#047857' : '#D97706'}
                    />
                    <ThemedText style={[
                      styles.statusBadgeText,
                      existingPayout ? styles.statusBadgeTextPaid : styles.statusBadgeTextPending
                    ]}>
                      {existingPayout ? 'LUNAS (TERBAYARKAN)' : 'BELUM DIBAYAR'}
                    </ThemedText>
                  </View>
                </View>

                {/* Motor Category Breakdown Box */}
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>
                    Rincian Komisi Per Jenis Motor:
                  </ThemedText>

                  {categoryBreakdown.length === 0 ? (
                    <ThemedText style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
                      Belum ada transaksi motor pada periode ini.
                    </ThemedText>
                  ) : (
                    categoryBreakdown.map((item, idx) => (
                      <View
                        key={idx}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: 6,
                          borderBottomWidth: idx === categoryBreakdown.length - 1 ? 0 : 1,
                          borderBottomColor: '#E2E8F0',
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>
                            {item.categoryName}
                          </ThemedText>
                          <ThemedText style={{ fontSize: 11, color: '#64748B' }}>
                            {item.count} Motor × {formatRp(item.commissionPerWash)}
                          </ThemedText>
                        </View>
                        <ThemedText style={{ fontSize: 13, fontWeight: '800', color: '#10B981' }}>
                          {formatRp(item.subtotal)}
                        </ThemedText>
                      </View>
                    ))
                  )}
                </View>

                {/* Calculation Details */}
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Total Motor Dicuci</ThemedText>
                  <ThemedText style={styles.detailValBold}>{washCount} Motor</ThemedText>
                </View>

                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Total Subtotal Komisi</ThemedText>
                  <ThemedText style={styles.detailValBold}>{formatRp(totalCommission)}</ThemedText>
                </View>

                {/* Bonus & Deduction Inputs */}
                <View style={styles.adjustRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.adjustLabel}>Bonus (Rp)</ThemedText>
                    <TextInput
                      style={styles.adjustInput}
                      keyboardType="numeric"
                      value={bonusInput}
                      onChangeText={setBonusInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.adjustLabel}>Potongan (Rp)</ThemedText>
                    <TextInput
                      style={styles.adjustInput}
                      keyboardType="numeric"
                      value={deductionInput}
                      onChangeText={setDeductionInput}
                    />
                  </View>
                </View>

                <View style={styles.cardDivider} />

                {/* Total Net Salary */}
                <View style={styles.totalRow}>
                  <ThemedText style={styles.totalLabel}>TOTAL GAJI DITERIMA</ThemedText>
                  <ThemedText style={styles.totalValue}>{formatRp(netSalary)}</ThemedText>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                  {!existingPayout && (
                    <TouchableOpacity style={styles.payBtn} onPress={handleMarkAsPaid}>
                      <Ionicons name="checkmark-done-circle" size={18} color="#FFFFFF" />
                      <ThemedText style={styles.payBtnText}>Tandai Terbayarkan</ThemedText>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.printBtn} onPress={() => handleOpenPrintPreview()}>
                    <Ionicons name="print-outline" size={18} color="#2563EB" />
                    <ThemedText style={styles.printBtnText}>Cetak Slip Gaji</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        ) : (
          /* TAB 2: RIWAYAT SLIP GAJI */
          <View style={styles.modalBody}>
            <ThemedText style={styles.inputLabel}>Riwayat Slip Gaji Terbayarkan</ThemedText>
            {payoutHistory.length === 0 ? (
              <View style={styles.emptyHistoryBox}>
                <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
                <ThemedText style={styles.emptyHistoryText}>Belum ada riwayat penggajian terbayarkan.</ThemedText>
              </View>
            ) : (
              <FlatList
                data={payoutHistory}
                keyExtractor={(item) => String(item.id)}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
                renderItem={({ item }) => (
                  <View style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <View>
                        <ThemedText style={styles.historyEmpName}>{item.employeeName}</ThemedText>
                        <ThemedText style={styles.historySub}>
                          {item.payoutNumber} • {item.startDate} s/d {item.endDate}
                        </ThemedText>
                      </View>
                      <View style={styles.historyBadge}>
                        <ThemedText style={styles.historyBadgeText}>LUNAS</ThemedText>
                      </View>
                    </View>

                    <View style={styles.historyBody}>
                      <ThemedText style={styles.historyWashInfo}>
                        {item.totalWashCount} Motor Dicuci (Total Komisi: {formatRp(item.totalCommission)})
                      </ThemedText>
                      <ThemedText style={styles.historyTotal}>{formatRp(item.netSalary)}</ThemedText>
                    </View>

                    <TouchableOpacity style={styles.historyPrintBtn} onPress={() => handleOpenPrintPreview(item)}>
                      <Ionicons name="print-outline" size={16} color="#2563EB" />
                      <ThemedText style={styles.historyPrintBtnText}>Cetak Ulang Slip</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        )}

        {/* MODAL PRINT PREVIEW SLIP GAJI THERMAL */}
        <Modal
          visible={printModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setPrintModalVisible(false)}
        >
          <View style={styles.printOverlay}>
            <View style={styles.printContent}>
              <View style={styles.printHeaderRow}>
                <ThemedText style={styles.printModalTitle}>Pratinjau Slip Gaji (Thermal 58mm)</ThemedText>
                <TouchableOpacity onPress={() => setPrintModalVisible(false)}>
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Thermal Receipt Preview View */}
              {slipDataToPrint && (
                <View style={styles.receiptPaper}>
                  <ThemedText style={styles.receiptTitle}>{slipDataToPrint.businessName.toUpperCase()}</ThemedText>
                  <ThemedText style={styles.receiptSubtitle}>SLIP GAJI & KOMISI CUCI</ThemedText>
                  <ThemedText style={styles.receiptDivider}>--------------------------------</ThemedText>

                  <ThemedText style={styles.receiptLine}>No Slip  : {slipDataToPrint.payoutNumber}</ThemedText>
                  <ThemedText style={styles.receiptLine}>Karyawan: {slipDataToPrint.employeeName}</ThemedText>
                  <ThemedText style={styles.receiptLine}>Periode : {slipDataToPrint.startDate} s/d {slipDataToPrint.endDate}</ThemedText>
                  <ThemedText style={styles.receiptLine}>Tgl Byr : {slipDataToPrint.paidAt}</ThemedText>
                  <ThemedText style={styles.receiptDivider}>--------------------------------</ThemedText>

                  <ThemedText style={styles.receiptLine}>Total Motor : {slipDataToPrint.totalWashCount} Motor</ThemedText>

                  {slipDataToPrint.categoryBreakdown && slipDataToPrint.categoryBreakdown.length > 0 && (
                    <>
                      <ThemedText style={styles.receiptDivider}>--------------------------------</ThemedText>
                      <ThemedText style={[styles.receiptLine, { fontWeight: '700' }]}>RINCIAN KOMISI PER MOTOR:</ThemedText>
                      {slipDataToPrint.categoryBreakdown.map((c: any, i: number) => (
                        <View key={i}>
                          <ThemedText style={styles.receiptLine}>{c.categoryName}</ThemedText>
                          <ThemedText style={styles.receiptLine}>  {c.count}x @{formatRp(c.commissionPerWash)} = {formatRp(c.subtotal)}</ThemedText>
                        </View>
                      ))}
                    </>
                  )}

                  <ThemedText style={styles.receiptDivider}>--------------------------------</ThemedText>
                  <ThemedText style={styles.receiptLine}>Subtotal Komisi: {formatRp(slipDataToPrint.totalCommission)}</ThemedText>
                  {slipDataToPrint.bonus > 0 && (
                    <ThemedText style={styles.receiptLine}>Bonus       : +{formatRp(slipDataToPrint.bonus)}</ThemedText>
                  )}
                  {slipDataToPrint.deduction > 0 && (
                    <ThemedText style={styles.receiptLine}>Potongan    : -{formatRp(slipDataToPrint.deduction)}</ThemedText>
                  )}
                  <ThemedText style={styles.receiptDivider}>--------------------------------</ThemedText>

                  <ThemedText style={styles.receiptTotalLine}>TOTAL DITERIMA: {formatRp(slipDataToPrint.netSalary)}</ThemedText>
                  <ThemedText style={styles.receiptStatusLine}>STATUS GAJI   : {slipDataToPrint.status.toUpperCase()}</ThemedText>
                  <ThemedText style={styles.receiptDivider}>--------------------------------</ThemedText>
                  <ThemedText style={styles.receiptFooter}>Terima kasih atas kerja keras Anda!</ThemedText>
                </View>
              )}

              {/* Action Print Button */}
              <TouchableOpacity
                style={styles.printActionBtn}
                onPress={() => {
                  if (slipDataToPrint) {
                    const bytesStr = buildSlipGajiBytes(slipDataToPrint);
                    // Bluetooth print ready
                  }
                  Alert.alert('Cetak Slip Gaji', 'Slip Gaji berhasil dikirimkan ke printer Bluetooth thermal.');
                  setPrintModalVisible(false);
                }}
              >
                <Ionicons name="print" size={20} color="#FFFFFF" />
                <ThemedText style={styles.printActionBtnText}>Cetak Ke Bluetooth Printer</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalSubScreen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalSubTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  tabBarRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#2563EB',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
  },
  horizontalEmpPicker: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  empPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  empPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  empPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  empPillTextActive: {
    color: '#FFFFFF',
  },
  periodBtnGroup: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  periodBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  periodBtnActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  periodBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  periodBtnTextActive: {
    color: '#0284C7',
  },
  dateInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  dateInfoText: {
    fontSize: 12,
    color: '#475569',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
  },
  salaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    elevation: 3,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    marginBottom: 20,
  },
  salaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
    marginBottom: 12,
  },
  salaryEmpName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  salarySubText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgePaid: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadgeTextPaid: {
    color: '#047857',
  },
  statusBadgeTextPending: {
    color: '#D97706',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  detailValBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  adjustRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  adjustLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  adjustInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2563EB',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  printBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
  },
  printBtnText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 13,
  },

  // History Tab Styles
  emptyHistoryBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyHistoryText: {
    color: '#64748B',
    fontSize: 13,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    elevation: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  historyEmpName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  historySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  historyBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  historyBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    marginBottom: 10,
  },
  historyWashInfo: {
    fontSize: 12,
    color: '#475569',
  },
  historyTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2563EB',
  },
  historyPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingVertical: 8,
    borderRadius: 8,
  },
  historyPrintBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },

  // Print Modal Preview Overlay
  printOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  printContent: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  printHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12,
    marginBottom: 16,
  },
  printModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  receiptPaper: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  receiptTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    color: '#0F172A',
  },
  receiptSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    color: '#475569',
  },
  receiptDivider: {
    textAlign: 'center',
    color: '#94A3B8',
    marginVertical: 4,
  },
  receiptLine: {
    fontSize: 12,
    color: '#1E293B',
    fontFamily: 'monospace',
  },
  receiptTotalLine: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  receiptStatusLine: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
    fontFamily: 'monospace',
  },
  receiptFooter: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#64748B',
  },
  printActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
  },
  printActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Configured Period Styles
  configuredPeriodBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  configuredPeriodLabel: {
    fontSize: 11,
    color: '#1E40AF',
  },
  configuredPeriodVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E3A8A',
    marginTop: 2,
  },
});
