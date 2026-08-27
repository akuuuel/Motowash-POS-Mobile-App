import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMasterStore } from '../../store/useMasterStore';
import { useTransactionStore } from '../../store/useTransactionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { db } from '../../db/client';
import { transactions, transactionCancellations } from '../../db/schema';
import { eq, desc, like, and } from 'drizzle-orm';
import { printReceiptThermal } from '../../utils/bluetoothPrinter';
import { useSweetAlert } from '@/components/SweetAlert';

export default function TransactionsScreen() {
  const [activeTab, setActiveTab] = useState<'baru' | 'riwayat'>('baru');

  return (
    <View style={styles.container}>
      {/* Tab Segmented Control */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'baru' && styles.tabButtonActive]}
          onPress={() => setActiveTab('baru')}
        >
          <Ionicons
            name="add-circle-outline"
            size={18}
            color={activeTab === 'baru' ? '#3B82F6' : '#64748B'}
          />
          <ThemedText style={[styles.tabText, activeTab === 'baru' && styles.tabTextActive]}>
            Transaksi Baru
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'riwayat' && styles.tabButtonActive]}
          onPress={() => setActiveTab('riwayat')}
        >
          <Ionicons
            name="list-outline"
            size={18}
            color={activeTab === 'riwayat' ? '#3B82F6' : '#64748B'}
          />
          <ThemedText style={[styles.tabText, activeTab === 'riwayat' && styles.tabTextActive]}>
            Riwayat Transaksi
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Screen Content */}
      {activeTab === 'baru' ? <NewTransactionView /> : <TransactionHistoryView />}
    </View>
  );
}

// ==========================================
// 1. KOMPONEN TRANSAKSI BARU
// ==========================================
function NewTransactionView() {
  const categories = useMasterStore((state) => state.categories);
  const employees = useMasterStore((state) => state.employees);
  const { form, setPlateNumber, selectCategory, selectEmployee, setFinalPrice, setPaymentMethod, setNotes, saveTransaction } = useTransactionStore();
  const settings = useSettingsStore();
  const sweetAlert = useSweetAlert();

  const [saving, setSaving] = useState(false);
  const [priceAdjusted, setPriceAdjusted] = useState(false);
  
  // Custom dialog cetak struk setelah sukses
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [lastSavedTx, setLastSavedTx] = useState<any>(null);

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num);
  };

  const handleSelectCategory = (cat: typeof categories[0]) => {
    selectCategory(cat.id, cat.name, cat.price);
    setPriceAdjusted(false);
  };

  const handleFinalPriceChange = (val: string) => {
    const numeric = parseInt(val.replace(/[^0-9]/g, ''), 10) || 0;
    setFinalPrice(numeric);
    setPriceAdjusted(numeric !== form.originalPrice);
  };

  const handleSave = async () => {
    if (!form.plateNumber.trim()) {
      sweetAlert.warning('Perhatian', 'Nomor plat motor wajib diisi.');
      return;
    }
    if (!form.vehicleCategoryId) {
      sweetAlert.warning('Perhatian', 'Silakan pilih jenis motor terlebih dahulu.');
      return;
    }
    if (!form.employeeId) {
      sweetAlert.warning('Perhatian', 'Silakan pilih karyawan pencuci.');
      return;
    }

    setSaving(true);
    try {
      const savedTx = await saveTransaction();
      setLastSavedTx(savedTx);
      setReceiptModalVisible(true);
      setPriceAdjusted(false);
    } catch (error: any) {
      sweetAlert.error('Simpan Gagal', error.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!lastSavedTx) return;
    try {
      await printReceiptThermal({
        businessName: settings.businessName,
        businessAddress: settings.businessAddress,
        businessPhone: settings.businessPhone,
        thankYouMessage: settings.thankYouMessage,
        transactionNumber: lastSavedTx.transactionNumber,
        createdAt: lastSavedTx.createdAt,
        plateNumber: lastSavedTx.plateNumber,
        vehicleCategoryName: lastSavedTx.vehicleCategoryName,
        employeeName: lastSavedTx.employeeName,
        paymentMethod: lastSavedTx.paymentMethod,
        originalPrice: lastSavedTx.originalPrice,
        finalPrice: lastSavedTx.finalPrice,
      });
      setReceiptModalVisible(false);
    } catch (e) {
      sweetAlert.error('Gagal Cetak', 'Terjadi kesalahan saat memproses cetakan.');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          style={styles.formContainer}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          <View>
      {/* A. Plat Nomor */}
      <ThemedText style={styles.inputLabel}>Plat Nomor Motor</ThemedText>
      <TextInput
        style={styles.textInput}
        placeholder="Contoh: DD 1234 AB"
        placeholderTextColor="#94A3B8"
        value={form.plateNumber}
        onChangeText={setPlateNumber}
        autoCapitalize="characters"
      />

      {/* B. Pilihan Kategori / Jenis Motor */}
      <ThemedText style={styles.inputLabel}>Jenis Motor & Tarif Cup</ThemedText>
      <View style={styles.gridContainer}>
        {categories.map((cat) => {
          const isSelected = form.vehicleCategoryId === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.gridCard, isSelected && styles.gridCardActive]}
              onPress={() => handleSelectCategory(cat)}
            >
              <ThemedText style={[styles.cardTitleText, isSelected && styles.cardTextActive]}>
                {cat.name.split(' (')[0]}
              </ThemedText>
              <ThemedText style={[styles.cardPriceText, isSelected && styles.cardTextActive]}>
                {formatRp(cat.price)}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* C. Penyesuaian Harga Final */}
      {form.vehicleCategoryId !== null && (
        <View style={styles.priceAdjustmentContainer}>
          <ThemedText style={styles.inputLabelSub}>Harga Cuci Akhir (Rp)</ThemedText>
          <TextInput
            style={[styles.textInput, priceAdjusted && styles.inputWarning]}
            placeholder="0"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            value={String(form.finalPrice)}
            onChangeText={handleFinalPriceChange}
          />
          {priceAdjusted && (
            <ThemedText style={styles.warningText}>
              * Harga telah disesuaikan secara manual dari harga dasar ({formatRp(form.originalPrice)}).
            </ThemedText>
          )}
        </View>
      )}

      {/* D. Pilihan Pencuci / Karyawan */}
      <ThemedText style={styles.inputLabel}>Pencuci Motor (Karyawan)</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalList} keyboardShouldPersistTaps="always">
        {employees.map((emp) => {
          const isSelected = form.employeeId === emp.id;
          return (
            <TouchableOpacity
              key={emp.id}
              style={[styles.chipButton, isSelected && styles.chipButtonActive]}
              onPress={() => selectEmployee(emp.id)}
            >
              <Ionicons
                name="person-outline"
                size={14}
                color={isSelected ? '#FFFFFF' : '#334155'}
              />
              <ThemedText style={[styles.chipText, isSelected && styles.chipTextActive]}>
                {emp.name}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* E. Pilihan Metode Pembayaran */}
      <ThemedText style={styles.inputLabel}>Metode Pembayaran</ThemedText>
      <View style={styles.paymentSelectorRow}>
        {['Tunai', 'QRIS', 'Transfer'].map((method) => {
          const isSelected = form.paymentMethod === method;
          return (
            <TouchableOpacity
              key={method}
              style={[styles.paymentSelectCol, isSelected && styles.paymentSelectColActive]}
              onPress={() => setPaymentMethod(method)}
            >
              <Ionicons
                name={method === 'Tunai' ? 'cash-outline' : method === 'QRIS' ? 'qr-code-outline' : 'card-outline'}
                size={18}
                color={isSelected ? '#3B82F6' : '#64748B'}
              />
              <ThemedText style={[styles.paymentSelectLabel, isSelected && styles.paymentSelectLabelActive]}>
                {method}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* F. Catatan Tambahan */}
      <ThemedText style={styles.inputLabel}>Catatan Tambahan (Opsional)</ThemedText>
      <TextInput
        style={[styles.textInput, styles.textArea]}
        placeholder="Contoh: Kunci ditinggal, cuci kolong ekstra, dll."
        placeholderTextColor="#94A3B8"
        value={form.notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
      />

      {/* G. Tombol Simpan */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <ThemedText style={styles.saveBtnText}>Simpan Transaksi</ThemedText>
          </>
        )}
      </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL SUKSES & CETAK STRUK - di luar ScrollView agar tidak mengganggu scroll */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={receiptModalVisible}
        onRequestClose={() => setReceiptModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalContent}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            </View>
            <ThemedText type="default" style={styles.modalHeading}>
              Transaksi Berhasil Disimpan!
            </ThemedText>
            <ThemedText style={styles.modalSubheading}>
              No. Transaksi: {lastSavedTx?.transactionNumber}
            </ThemedText>
            
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.printButton} onPress={handlePrintReceipt}>
                <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                <ThemedText style={styles.printButtonText}>Cetak Struk</ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setReceiptModalVisible(false)}
              >
                <ThemedText style={styles.closeButtonText}>Selesai (Tanpa Struk)</ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        </View>
      </Modal>
      <sweetAlert.AlertComponent />
    </View>
  );
}

// ==========================================
// 2. KOMPONEN RIWAYAT TRANSAKSI
// ==========================================
function TransactionHistoryView() {
  const [searchText, setSearchText] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const sweetAlert = useSweetAlert();
  
  // States Detail Modal
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  
  // States Pembatalan Modal
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const settings = useSettingsStore();

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await db.select()
        .from(transactions)
        .orderBy(desc(transactions.id));
      setHistory(data);
    } catch (e) {
      console.error('Failed to load history list:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num);
  };

  const handleCancelTransaction = async () => {
    if (!cancelReason.trim()) {
      sweetAlert.warning('Perhatian', 'Alasan pembatalan wajib diisi.');
      return;
    }

    setCancelling(true);
    try {
      await db.transaction(async (tx) => {
        // 1. Update status transaksi menjadi 'cancelled'
        await tx.update(transactions)
          .set({ status: 'cancelled' })
          .where(eq(transactions.id, selectedTx.id));

        // 2. Catat riwayat pembatalan
        await tx.insert(transactionCancellations)
          .values({
            transactionId: selectedTx.id,
            reason: cancelReason.trim(),
          });
      });

      sweetAlert.success('Sukses', 'Transaksi berhasil dibatalkan.');
      setCancelVisible(false);
      setDetailVisible(false);
      setCancelReason('');
      loadHistory(); // Reload
    } catch (error: any) {
      sweetAlert.error('Gagal', error.message || 'Gagal membatalkan transaksi.');
    } finally {
      setCancelling(false);
    }
  };

  const handlePrintAgain = async () => {
    if (!selectedTx) return;
    try {
      await printReceiptThermal({
        businessName: settings.businessName,
        businessAddress: settings.businessAddress,
        businessPhone: settings.businessPhone,
        thankYouMessage: settings.thankYouMessage,
        transactionNumber: selectedTx.transactionNumber,
        createdAt: selectedTx.createdAt,
        plateNumber: selectedTx.plateNumber,
        vehicleCategoryName: selectedTx.vehicleCategoryName,
        employeeName: selectedTx.employeeName,
        paymentMethod: selectedTx.paymentMethod,
        originalPrice: selectedTx.originalPrice,
        finalPrice: selectedTx.finalPrice,
      });
    } catch (e) {
      sweetAlert.error('Gagal Cetak', 'Terjadi kesalahan saat memproses cetakan.');
    }
  };

  const filteredHistory = history.filter((item) => {
    const term = searchText.toLowerCase().trim();
    if (!term) return true;
    return (
      item.plateNumber.toLowerCase().includes(term) ||
      item.transactionNumber.toLowerCase().includes(term) ||
      item.employeeName.toLowerCase().includes(term)
    );
  });

  return (
    <View style={styles.historyContainer}>
      {/* Search Input */}
      <View style={styles.searchBarContainer}>
        <Ionicons name="search-outline" size={20} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari Plat Nomor / No. Transaksi"
          placeholderTextColor="#94A3B8"
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="characters"
        />
      </View>

      {/* List Transaksi */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            const isCancelled = item.status === 'cancelled';
            const normalizedStr = item.createdAt ? String(item.createdAt).replace(' ', 'T') : '';
            const dateObj = new Date(normalizedStr);
            const localDate = isNaN(dateObj.getTime())
              ? item.createdAt
              : dateObj.toLocaleString('id-ID', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });
            const formattedDate = localDate;

            return (
              <TouchableOpacity
                style={[styles.txCard, isCancelled && styles.cardDisabled]}
                onPress={() => {
                  setSelectedTx(item);
                  setDetailVisible(true);
                }}
              >
                <View style={styles.cardHeader}>
                  <ThemedText style={styles.cardTxNumber}>{item.transactionNumber}</ThemedText>
                  <ThemedText style={styles.cardDate}>{formattedDate}</ThemedText>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardBodyLeft}>
                    <ThemedText style={styles.cardPlate}>{item.plateNumber}</ThemedText>
                    <ThemedText style={styles.cardSub}>
                      {item.vehicleCategoryName} • {item.employeeName}
                    </ThemedText>
                  </View>
                  <View style={styles.cardBodyRight}>
                    <ThemedText style={[styles.cardPrice, isCancelled && styles.lineThrough]}>
                      {formatRp(item.finalPrice)}
                    </ThemedText>
                    <View style={[
                      styles.statusIndicator,
                      isCancelled ? styles.statusCancelBg : styles.statusSuccessBg
                    ]}>
                      <ThemedText style={[
                        styles.indicatorText,
                        isCancelled ? styles.statusCancelText : styles.statusSuccessText
                      ]}>
                        {isCancelled ? 'Batal' : item.paymentMethod}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <ThemedText style={styles.emptyText}>Tidak ada riwayat transaksi ditemukan.</ThemedText>
          }
        />
      )}

      {/* MODAL DETAIL TRANSAKSI */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={detailVisible}
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.detailModalContent}>
            <View style={styles.modalHeaderRow}>
              <ThemedText type="default" style={styles.detailHeading}>
                Detail Transaksi
              </ThemedText>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedTx && (
              <ScrollView style={styles.detailScrollView} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailLabel}>No. Transaksi</ThemedText>
                  <ThemedText style={styles.detailValueBold}>{selectedTx.transactionNumber}</ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailLabel}>Plat Nomor</ThemedText>
                  <ThemedText style={styles.detailValue}>{selectedTx.plateNumber}</ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailLabel}>Tipe / Jenis Motor</ThemedText>
                  <ThemedText style={styles.detailValue}>{selectedTx.vehicleCategoryName}</ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailLabel}>Pencuci (Karyawan)</ThemedText>
                  <ThemedText style={styles.detailValue}>{selectedTx.employeeName}</ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailLabel}>Pembayaran</ThemedText>
                  <ThemedText style={styles.detailValue}>{selectedTx.paymentMethod}</ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailLabel}>Harga Tarif Dasar</ThemedText>
                  <ThemedText style={styles.detailValue}>{formatRp(selectedTx.originalPrice)}</ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailLabel}>Harga Aktual (Akhir)</ThemedText>
                  <ThemedText style={styles.detailValueBold}>{formatRp(selectedTx.finalPrice)}</ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailLabel}>Status Aktif</ThemedText>
                  <ThemedText style={[
                    styles.detailValueBold,
                    selectedTx.status === 'cancelled' ? { color: '#EF4444' } : { color: '#10B981' }
                  ]}>
                    {selectedTx.status === 'cancelled' ? 'Dibatalkan' : 'Selesai'}
                  </ThemedText>
                </View>
                {selectedTx.notes && (
                  <View style={styles.detailItem}>
                    <ThemedText style={styles.detailLabel}>Catatan</ThemedText>
                    <ThemedText style={styles.detailValue}>{selectedTx.notes}</ThemedText>
                  </View>
                )}

                <View style={styles.detailButtonsRow}>
                  <TouchableOpacity style={styles.actionPrintButton} onPress={handlePrintAgain}>
                    <Ionicons name="print-outline" size={16} color="#FFFFFF" />
                    <ThemedText style={styles.actionPrintButtonText}>Cetak Ulang</ThemedText>
                  </TouchableOpacity>

                  {selectedTx.status !== 'cancelled' && (
                    <TouchableOpacity
                      style={styles.actionCancelButton}
                      onPress={() => setCancelVisible(true)}
                    >
                      <Ionicons name="close-circle-outline" size={16} color="#FFFFFF" />
                      <ThemedText style={styles.actionCancelButtonText}>Batalkan</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </ThemedView>
        </View>
      </Modal>

      {/* MODAL PEMBATALAN TRANSAKSI */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={cancelVisible}
        onRequestClose={() => setCancelVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.cancelModalContent}>
            <ThemedText type="default" style={styles.cancelHeading}>
              Alasan Pembatalan Transaksi
            </ThemedText>
            <ThemedText style={styles.cancelSubheading}>
              Transaksi {selectedTx?.transactionNumber} tidak dapat diaktifkan kembali jika dibatalkan.
            </ThemedText>

            <TextInput
              style={[styles.textInput, styles.textArea, { marginBottom: 20 }]}
              placeholder="Sebutkan alasan pembatalan (misal: Salah input plat, Kategori salah, dll.)"
              placeholderTextColor="#94A3B8"
              value={cancelReason}
              onChangeText={setCancelReason}
            />

            <View style={styles.modalButtonContainerRow}>
              <TouchableOpacity
                style={styles.cancelBackBtn}
                onPress={() => setCancelVisible(false)}
              >
                <ThemedText style={styles.cancelBackBtnText}>Kembali</ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.cancelConfirmBtn, cancelling && styles.saveBtnDisabled]}
                onPress={handleCancelTransaction}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.cancelConfirmBtnText}>Konfirmasi Batal</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </ThemedView>
        </View>
      </Modal>
      <sweetAlert.AlertComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tab Bar Styles
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabButtonActive: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  tabText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#3B82F6',
  },

  // Form Styles
  formContainer: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingBottom: 140,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 14,
    marginBottom: 8,
  },
  inputLabelSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  textArea: {
    textAlignVertical: 'top',
    height: 70,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  gridCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
    borderWidth: 1.5,
  },
  cardTitleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  cardPriceText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  cardTextActive: {
    color: '#1E3A8A',
  },
  priceAdjustmentContainer: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputWarning: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFDF5',
  },
  warningText: {
    fontSize: 10,
    color: '#D97706',
    marginTop: 6,
  },
  horizontalList: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 5,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  chipButtonActive: {
    backgroundColor: '#3B82F6',
  },
  chipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  paymentSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentSelectCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
  },
  paymentSelectColActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
  },
  paymentSelectLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  paymentSelectLabelActive: {
    color: '#3B82F6',
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 24,
    elevation: 3,
  },
  saveBtnDisabled: {
    backgroundColor: '#93C5FD',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 12,
  },
  modalHeading: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSubheading: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtonContainer: {
    width: '100%',
    gap: 10,
  },
  printButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  printButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  closeButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },

  // History List Styles
  historyContainer: {
    flex: 1,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 140,
  },
  txCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  cardDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 8,
  },
  cardTxNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  cardDate: {
    fontSize: 11,
    color: '#64748B',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBodyLeft: {
    flex: 1,
  },
  cardPlate: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  cardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  cardBodyRight: {
    alignItems: 'flex-end',
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  lineThrough: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  statusIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  statusSuccessBg: {
    backgroundColor: '#E0F2FE',
  },
  statusSuccessText: {
    color: '#0284C7',
  },
  statusCancelBg: {
    backgroundColor: '#FEE2E2',
  },
  statusCancelText: {
    color: '#EF4444',
  },
  indicatorText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // Detail Modal Styles
  detailModalContent: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 16,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12,
    marginBottom: 16,
  },
  detailHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  detailScrollView: {
    maxHeight: 380,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
  detailValueBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  detailButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    paddingBottom: 10,
  },
  actionPrintButton: {
    flex: 1.2,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionPrintButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  actionCancelButton: {
    flex: 0.8,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionCancelButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  // Cancellation Modal
  cancelModalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 20,
  },
  cancelHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  cancelSubheading: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 16,
  },
  modalButtonContainerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBackBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBackBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  cancelConfirmBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelConfirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    paddingVertical: 16,
    fontStyle: 'italic',
    fontSize: 13,
  },
});
