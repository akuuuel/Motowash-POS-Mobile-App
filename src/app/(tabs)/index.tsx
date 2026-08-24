import React, { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, View, ActivityIndicator, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../db/client';
import { transactions } from '../../db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { ThemedText } from '@/components/themed-text';
import { useSettingsStore } from '../../store/useSettingsStore';

export default function DashboardScreen() {
  const router = useRouter();
  const businessName = useSettingsStore((state) => state.businessName);
  
  // Dashboard states
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalIncome: 0,
    totalWash: 0,
    cashIncome: 0,
    qrisIncome: 0,
    transferIncome: 0,
    employeeContributions: [] as { name: string; count: number }[],
    recentTransactions: [] as any[],
    todayTransactions: [] as any[],
  });

  // Modal Detail Metode Pembayaran State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'Tunai' | 'QRIS' | 'Transfer' | null>(null);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Query transaksi hari ini (mengonversi UTC database ke timezone lokal perangkat)
      const todayTxs = await db.select()
        .from(transactions)
        .where(
          and(
            sql`date(${transactions.createdAt}, 'localtime') = date('now', 'localtime')`,
            eq(transactions.status, 'completed')
          )
        )
        .orderBy(desc(transactions.id));

      // Query 5 transaksi terakhir untuk feed aktivitas
      const recentTxs = await db.select()
        .from(transactions)
        .orderBy(desc(transactions.id))
        .limit(5);

      // 2. Hitung statistik dasar
      let income = 0;
      let cash = 0;
      let qris = 0;
      let transfer = 0;
      const empMap: Record<string, number> = {};

      todayTxs.forEach((tx) => {
        income += tx.finalPrice;
        if (tx.paymentMethod === 'Tunai') cash += tx.finalPrice;
        else if (tx.paymentMethod === 'QRIS') qris += tx.finalPrice;
        else if (tx.paymentMethod === 'Transfer') transfer += tx.finalPrice;

        const empName = tx.employeeName;
        empMap[empName] = (empMap[empName] || 0) + 1;
      });

      // Format kontribusi pencucian karyawan
      const employeeContributions = Object.entries(empMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      setStats({
        totalIncome: income,
        totalWash: todayTxs.length,
        cashIncome: cash,
        qrisIncome: qris,
        transferIncome: transfer,
        employeeContributions,
        recentTransactions: recentTxs as any[],
        todayTransactions: todayTxs as any[],
      });
    } catch (e) {
      console.error('Gagal memuat data dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num);
  };

  const getTodayFormattedDate = () => {
    const today = new Date();
    return today.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleOpenPaymentDetail = (method: 'Tunai' | 'QRIS' | 'Transfer') => {
    setSelectedPaymentMethod(method);
    setPaymentModalVisible(true);
  };

  const getFilteredTodayTransactions = () => {
    if (!selectedPaymentMethod) return [];
    return stats.todayTransactions.filter((tx) => tx.paymentMethod === selectedPaymentMethod);
  };

  const getSelectedPaymentTotal = () => {
    if (selectedPaymentMethod === 'Tunai') return stats.cashIncome;
    if (selectedPaymentMethod === 'QRIS') return stats.qrisIncome;
    if (selectedPaymentMethod === 'Transfer') return stats.transferIncome;
    return 0;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const filteredPaymentList = getFilteredTodayTransactions();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
      {/* 1. Header Sambutan Clean */}
      <View style={styles.heroBanner}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.todayDateText}>{getTodayFormattedDate()}</ThemedText>
            <ThemedText style={styles.heroBizName}>{businessName}</ThemedText>
          </View>
          <View style={styles.headerIconCircle}>
            <Ionicons name="storefront-outline" size={24} color="#2563EB" />
          </View>
        </View>
      </View>

      {/* 2. Kartu Ringkasan Pendapatan & Motor Dicuci */}
      <View style={styles.kpiRow}>
        {/* Total Pendapatan Card */}
        <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
          <View style={styles.kpiCardHeader}>
            <ThemedText style={styles.kpiCardLabelLight}>Pendapatan Hari Ini</ThemedText>
            <View style={styles.iconCircleWhite}>
              <Ionicons name="wallet-outline" size={18} color="#2563EB" />
            </View>
          </View>
          <ThemedText style={styles.kpiValueWhite}>{formatRp(stats.totalIncome)}</ThemedText>
          <View style={styles.kpiFooterLight}>
            <Ionicons name="trending-up" size={14} color="#6EE7B7" />
            <ThemedText style={styles.kpiFooterTextLight}>Terbuku Otomatis</ThemedText>
          </View>
        </View>

        {/* Total Wash Count Card */}
        <View style={[styles.kpiCard, styles.kpiCardSecondary]}>
          <View style={styles.kpiCardHeader}>
            <ThemedText style={styles.kpiCardLabelDark}>Motor Dicuci</ThemedText>
            <View style={styles.iconCircleBlue}>
              <Ionicons name="bicycle-outline" size={18} color="#2563EB" />
            </View>
          </View>
          <ThemedText style={styles.kpiValueDark}>{stats.totalWash}</ThemedText>
          <ThemedText style={styles.kpiUnitText}>Kendaraan</ThemedText>
        </View>
      </View>

      {/* 3. Rincian Metode Pembayaran (Clickable / Interaktif) */}
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionTitle}>Rincian Metode Pembayaran</ThemedText>
        <ThemedText style={styles.sectionSubtitleHint}>Klik kartu untuk detail</ThemedText>
      </View>
      <View style={styles.paymentRow}>
        <TouchableOpacity
          style={styles.paymentCol}
          onPress={() => handleOpenPaymentDetail('Tunai')}
          activeOpacity={0.7}
        >
          <View style={[styles.paymentIconBox, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="cash" size={20} color="#059669" />
          </View>
          <ThemedText style={styles.paymentLabel}>Tunai</ThemedText>
          <ThemedText style={styles.paymentVal}>{formatRp(stats.cashIncome)}</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.paymentCol}
          onPress={() => handleOpenPaymentDetail('QRIS')}
          activeOpacity={0.7}
        >
          <View style={[styles.paymentIconBox, { backgroundColor: '#E0F2FE' }]}>
            <Ionicons name="qr-code" size={20} color="#0284C7" />
          </View>
          <ThemedText style={styles.paymentLabel}>QRIS</ThemedText>
          <ThemedText style={styles.paymentVal}>{formatRp(stats.qrisIncome)}</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.paymentCol}
          onPress={() => handleOpenPaymentDetail('Transfer')}
          activeOpacity={0.7}
        >
          <View style={[styles.paymentIconBox, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="card" size={20} color="#4F46E5" />
          </View>
          <ThemedText style={styles.paymentLabel}>Transfer</ThemedText>
          <ThemedText style={styles.paymentVal}>{formatRp(stats.transferIncome)}</ThemedText>
        </TouchableOpacity>
      </View>

      {/* 4. Produktivitas Karyawan Pencuci */}
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionTitle}>Produktivitas Karyawan</ThemedText>
      </View>
      <View style={styles.modernCard}>
        {stats.employeeContributions.length === 0 ? (
          <ThemedText style={styles.emptyText}>Belum ada aktivitas karyawan hari ini.</ThemedText>
        ) : (
          stats.employeeContributions.map((emp, idx) => (
            <View key={emp.name} style={[styles.employeeItemRow, idx > 0 && styles.divider]}>
              <View style={styles.employeeInfoLeft}>
                <View style={styles.avatarCircle}>
                  <ThemedText style={styles.avatarLetter}>{emp.name.charAt(0).toUpperCase()}</ThemedText>
                </View>
                <ThemedText style={styles.employeeName}>{emp.name}</ThemedText>
              </View>
              <View style={styles.employeePill}>
                <Ionicons name="checkmark-done" size={14} color="#2563EB" />
                <ThemedText style={styles.employeeCountText}>{emp.count} Motor</ThemedText>
              </View>
            </View>
          ))
        )}
      </View>

      {/* 5. Transaksi Terakhir */}
      <View style={styles.sectionHeaderRow}>
        <ThemedText style={styles.sectionTitle}>5 Transaksi Terakhir</ThemedText>
        <TouchableOpacity onPress={() => router.push('/transactions')}>
          <ThemedText style={styles.seeAllText}>Lihat Semua</ThemedText>
        </TouchableOpacity>
      </View>
      <View style={styles.modernCard}>
        {stats.recentTransactions.length === 0 ? (
          <ThemedText style={styles.emptyText}>Belum ada transaksi tercatat.</ThemedText>
        ) : (
          stats.recentTransactions.map((tx: any, idx) => (
            <View key={tx.id} style={[styles.txItemRow, idx > 0 && styles.divider]}>
              <View style={styles.txLeftCol}>
                <View style={styles.txPlateBadge}>
                  <ThemedText style={styles.txPlateText}>{tx.plateNumber}</ThemedText>
                </View>
                <ThemedText style={styles.txSubText}>
                  {tx.transactionNumber} • {tx.vehicleCategoryName}
                </ThemedText>
              </View>
              <View style={styles.txRightCol}>
                <ThemedText style={styles.txPriceText}>{formatRp(tx.finalPrice)}</ThemedText>
                <View style={[
                  styles.statusTag,
                  tx.status === 'cancelled' ? styles.statusTagCancelled : styles.statusTagActive
                ]}>
                  <ThemedText style={[
                    styles.statusTagText,
                    tx.status === 'cancelled' ? styles.statusTagTextCancelled : styles.statusTagTextActive
                  ]}>
                    {tx.status === 'cancelled' ? 'Batal' : tx.paymentMethod}
                  </ThemedText>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* MODAL DETAIL TRANSAKSI BERDASARKAN METODE PEMBAYARAN */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={paymentModalVisible}
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View>
                <ThemedText style={styles.modalTitleText}>
                  Transaksi {selectedPaymentMethod} Hari Ini
                </ThemedText>
                <ThemedText style={styles.modalSubTitleText}>
                  Total: {formatRp(getSelectedPaymentTotal())} ({filteredPaymentList.length} Transaksi)
                </ThemedText>
              </View>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* List Transaksi Metode Pembayaran */}
            {filteredPaymentList.length === 0 ? (
              <View style={styles.modalEmptyBox}>
                <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
                <ThemedText style={styles.modalEmptyText}>
                  Belum ada transaksi dengan pembayaran {selectedPaymentMethod} hari ini.
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={filteredPaymentList}
                keyExtractor={(item) => String(item.id)}
                style={styles.modalList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
                renderItem={({ item }) => {
                  const txTime = new Date(item.createdAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <View style={styles.modalTxRow}>
                      <View style={styles.modalTxLeft}>
                        <View style={styles.modalPlateBadge}>
                          <ThemedText style={styles.modalPlateText}>{item.plateNumber}</ThemedText>
                        </View>
                        <ThemedText style={styles.modalTxSub}>
                          {item.vehicleCategoryName} • Pencuci: {item.employeeName}
                        </ThemedText>
                        <ThemedText style={styles.modalTxTimeText}>
                          {item.transactionNumber} • Jam {txTime}
                        </ThemedText>
                      </View>

                      <View style={styles.modalTxRight}>
                        <ThemedText style={styles.modalTxPrice}>{formatRp(item.finalPrice)}</ThemedText>
                        <View style={styles.modalPaymentBadge}>
                          <ThemedText style={styles.modalPaymentBadgeText}>{item.paymentMethod}</ThemedText>
                        </View>
                      </View>
                    </View>
                  );
                }}
              />
            )}

            {/* Modal Footer Close Button */}
            <TouchableOpacity style={styles.modalBottomCloseBtn} onPress={() => setPaymentModalVisible(false)}>
              <ThemedText style={styles.modalBottomCloseBtnText}>Tutup Detail</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },

  // 1. Hero Banner
  heroBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  todayDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroBizName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },

  // 2. KPI Cards
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    borderRadius: 16,
    padding: 16,
    elevation: 4,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  kpiCardPrimary: {
    flex: 1.4,
    backgroundColor: '#2563EB',
  },
  kpiCardSecondary: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiCardLabelLight: {
    fontSize: 12,
    fontWeight: '600',
    color: '#93C5FD',
  },
  kpiCardLabelDark: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  iconCircleWhite: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleBlue: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiValueWhite: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  kpiValueDark: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiUnitText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  kpiFooterLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  kpiFooterTextLight: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A7F3D0',
  },

  // Section Typography
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  sectionSubtitleHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },

  // 3. Payment Method Breakdown (Clickable Cards)
  paymentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  paymentCol: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  paymentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  paymentVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },

  // 4. Modern Cards with Neat Shadows
  modernCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  employeeItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  employeeInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  employeePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  employeeCountText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },

  // 5. Recent Transactions
  txItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  txLeftCol: {
    flex: 1,
    gap: 2,
  },
  txPlateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  txPlateText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  txSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  txRightCol: {
    alignItems: 'flex-end',
  },
  txPriceText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  statusTagActive: {
    backgroundColor: '#EFF6FF',
  },
  statusTagCancelled: {
    backgroundColor: '#FEF2F2',
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTagTextActive: {
    color: '#2563EB',
  },
  statusTagTextCancelled: {
    color: '#EF4444',
  },

  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    paddingVertical: 20,
    fontStyle: 'italic',
    fontSize: 13,
  },

  // MODAL DETAIL METODE PEMBAYARAN STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    elevation: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
    marginBottom: 12,
  },
  modalTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubTitleText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalList: {
    maxHeight: 340,
  },
  modalTxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTxLeft: {
    flex: 1,
    paddingRight: 8,
  },
  modalPlateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  modalPlateText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalTxSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  modalTxTimeText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalTxRight: {
    alignItems: 'flex-end',
  },
  modalTxPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalPaymentBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  modalPaymentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  modalEmptyBox: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 10,
  },
  modalEmptyText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 13,
    paddingHorizontal: 20,
  },
  modalBottomCloseBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  modalBottomCloseBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
