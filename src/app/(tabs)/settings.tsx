import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMasterStore } from '../../store/useMasterStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { db } from '../../db/client';
import { employees, vehicleCategories, transactions, settings, transactionCancellations } from '../../db/schema';
import { eq } from 'drizzle-orm';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { printReceiptThermal, openBluetoothSettings, getNativePairedDevices, BluetoothDeviceInfo } from '../../utils/bluetoothPrinter';

export default function SettingsScreen() {
  const settingsStore = useSettingsStore();

  // Modal screen controllers
  const [activeModal, setActiveModal] = useState<'karyawan' | 'motor' | 'printer' | 'backup' | null>(null);

  const currentPeriod = settingsStore.payrollPeriod || 'mingguan';

  const handleSelectPeriod = async (p: 'harian' | 'mingguan' | 'bulanan') => {
    try {
      await settingsStore.updateSetting('payroll_period', p);
      Alert.alert('Sukses', `Periode penggajian operasional diubah menjadi ${p === 'harian' ? 'Harian' : p === 'mingguan' ? 'Mingguan' : 'Bulanan'}.`);
    } catch (e) {
      Alert.alert('Gagal', 'Gagal menyimpan periode penggajian.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <ThemedText style={styles.sectionHeader}>Pengelolaan Usaha</ThemedText>
      
      {/* 1. Kelola Karyawan */}
      <TouchableOpacity style={styles.menuItem} onPress={() => setActiveModal('karyawan')}>
        <View style={styles.menuLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="people-outline" size={20} color="#2563EB" />
          </View>
          <View>
            <ThemedText style={styles.menuTitle}>Data Karyawan</ThemedText>
            <ThemedText style={styles.menuSubtitle}>Tambah, edit nama karyawan & status aktif pencuci</ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      </TouchableOpacity>

      {/* 2. Kelola Jenis Motor & Tarif */}
      <TouchableOpacity style={styles.menuItem} onPress={() => setActiveModal('motor')}>
        <View style={styles.menuLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="bicycle-outline" size={20} color="#059669" />
          </View>
          <View>
            <ThemedText style={styles.menuTitle}>Jenis Motor & Tarif</ThemedText>
            <ThemedText style={styles.menuSubtitle}>Atur tipe kendaraan dan biaya cuci</ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      </TouchableOpacity>

      {/* 3. Pengaturan Durasi Penggajian Default (Owner) */}
      <ThemedView type="backgroundElement" style={styles.settingCardBox}>
        <View style={styles.menuLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="calendar-outline" size={20} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.menuTitle}>Durasi Penggajian Operasional</ThemedText>
            <ThemedText style={styles.menuSubtitle}>Pilih periode perhitungan komisi gaji karyawan</ThemedText>
          </View>
        </View>

        <View style={styles.periodSelectorRow}>
          <TouchableOpacity
            style={[styles.periodOptionBtn, currentPeriod === 'harian' && styles.periodOptionBtnActive]}
            onPress={() => handleSelectPeriod('harian')}
          >
            <ThemedText style={[styles.periodOptionText, currentPeriod === 'harian' && styles.periodOptionTextActive]}>
              Harian
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.periodOptionBtn, currentPeriod === 'mingguan' && styles.periodOptionBtnActive]}
            onPress={() => handleSelectPeriod('mingguan')}
          >
            <ThemedText style={[styles.periodOptionText, currentPeriod === 'mingguan' && styles.periodOptionTextActive]}>
              Mingguan
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.periodOptionBtn, currentPeriod === 'bulanan' && styles.periodOptionBtnActive]}
            onPress={() => handleSelectPeriod('bulanan')}
          >
            <ThemedText style={[styles.periodOptionText, currentPeriod === 'bulanan' && styles.periodOptionTextActive]}>
              Bulanan
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>

      <ThemedText style={styles.sectionHeader}>Setelan Perangkat & Data</ThemedText>

      {/* 4. Pengaturan Printer */}
      <TouchableOpacity style={styles.menuItem} onPress={() => setActiveModal('printer')}>
        <View style={styles.menuLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="print-outline" size={20} color="#EA580C" />
          </View>
          <View>
            <ThemedText style={styles.menuTitle}>Struk & Printer Bluetooth</ThemedText>
            <ThemedText style={styles.menuSubtitle}>Atur informasi struk dan koneksi printer</ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      </TouchableOpacity>

      {/* 5. Backup & Restore */}
      <TouchableOpacity style={styles.menuItem} onPress={() => setActiveModal('backup')}>
        <View style={styles.menuLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: '#F5F5F5' }]}>
            <Ionicons name="server-outline" size={20} color="#4B5563" />
          </View>
          <View>
            <ThemedText style={styles.menuTitle}>Backup & Restore Data</ThemedText>
            <ThemedText style={styles.menuSubtitle}>Amankan data lokal ke file eksternal</ThemedText>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      </TouchableOpacity>

      <View style={styles.appFooter}>
        <ThemedText style={styles.footerText}>Koko Motowash v1.0.0 (MVP)</ThemedText>
        <ThemedText style={styles.footerTextSub}>Local-First Database SQLite & Drizzle</ThemedText>
      </View>

      {/* Modal Sub-Sistem */}
      <EmployeeManagementModal visible={activeModal === 'karyawan'} onClose={() => setActiveModal(null)} />
      <MotorManagementModal visible={activeModal === 'motor'} onClose={() => setActiveModal(null)} />
      <PrinterSettingsModal visible={activeModal === 'printer'} onClose={() => setActiveModal(null)} />
      <BackupRestoreModal visible={activeModal === 'backup'} onClose={() => setActiveModal(null)} />
    </ScrollView>
  );
}

// ==========================================
// 1. MODAL KELOLA KARYAWAN
// ==========================================
function EmployeeManagementModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const employeesList = useMasterStore((state) => state.employees);
  const fetchEmployees = useMasterStore((state) => state.fetchEmployees);
  
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit employee state
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const handleAddEmployee = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      await db.insert(employees).values({
        name: name.trim(),
        commissionPerWash: 5000,
        paymentPeriod: 'mingguan',
        status: 'active',
      });
      setName('');
      await fetchEmployees();
      Alert.alert('Sukses', 'Karyawan baru berhasil ditambahkan.');
    } catch (e) {
      Alert.alert('Gagal', 'Gagal menyimpan karyawan baru.');
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    if (!editName.trim()) return;
    try {
      await db.update(employees).set({
        name: editName.trim(),
      }).where(eq(employees.id, id));
      setEditingEmpId(null);
      await fetchEmployees();
      Alert.alert('Sukses', 'Nama karyawan berhasil diperbarui.');
    } catch (e) {
      Alert.alert('Gagal', 'Gagal memperbarui nama karyawan.');
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await db.update(employees).set({ status: nextStatus }).where(eq(employees.id, id));
      await fetchEmployees();
    } catch (e) {
      Alert.alert('Gagal', 'Gagal memperbarui status karyawan.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ThemedView type="backgroundElement" style={styles.modalSubScreen}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="arrow-back" size={24} color="#1E293B" />
              </TouchableOpacity>
              <ThemedText type="default" style={styles.modalSubTitle}>Data Karyawan</ThemedText>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 220 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {/* Form input karyawan baru */}
          <ThemedText style={styles.inputLabel}>Tambah Karyawan Baru</ThemedText>
          <View style={{ gap: 10, marginBottom: 20 }}>
            <TextInput
              style={styles.textInput}
              placeholder="Nama Karyawan (contoh: Budi Cuci)"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddEmployee} disabled={adding}>
              {adding ? <ActivityIndicator color="#FFF" /> : <ThemedText style={styles.saveBtnText}>+ Tambah Karyawan</ThemedText>}
            </TouchableOpacity>
          </View>

          {/* List karyawan */}
          <ThemedText style={[styles.inputLabel, { marginTop: 10 }]}>Daftar Karyawan</ThemedText>
          {employeesList.map((emp: any) => (
            <View key={emp.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>{emp.name}</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: emp.status === 'active' ? '#10B981' : '#94A3B8' }} />
                    <ThemedText style={{ fontSize: 12, color: emp.status === 'active' ? '#059669' : '#64748B', fontWeight: '700' }}>
                      {emp.status === 'active' ? 'Aktif' : 'Non-Aktif'}
                    </ThemedText>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    style={{ padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8 }}
                    onPress={() => {
                      setEditingEmpId(emp.id);
                      setEditName(emp.name);
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color="#2563EB" />
                  </TouchableOpacity>

                  <Switch
                    value={emp.status === 'active'}
                    onValueChange={() => handleToggleStatus(emp.id, emp.status)}
                  />
                </View>
              </View>

              {/* Inline Edit Form */}
              {editingEmpId === emp.id && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 10 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>Edit Nama Karyawan</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Nama Karyawan"
                  />

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                      onPress={() => handleSaveEdit(emp.id)}
                    >
                      <ThemedText style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>Simpan Nama</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                      onPress={() => setEditingEmpId(null)}
                    >
                      <ThemedText style={{ color: '#64748B', fontWeight: '700', fontSize: 12 }}>Batal</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
            </KeyboardAvoidingView>
          </ThemedView>
        </TouchableWithoutFeedback>
      </Modal>
  );
}

// ==========================================
// 2. MODAL KELOLA JENIS MOTOR & TARIF
// ==========================================
function MotorManagementModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const categoriesList = useMasterStore((state) => state.categories);
  const fetchCategories = useMasterStore((state) => state.fetchCategories);
  
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [commission, setCommission] = useState('8000');
  const [saving, setSaving] = useState(false);

  // Edit category state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editCommission, setEditCommission] = useState('');

  const handleAddCategory = async () => {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      await db.insert(vehicleCategories).values({
        name: name.trim(),
        price: parseInt(price, 10) || 0,
        commission: parseInt(commission, 10) || 5000,
        status: 'active',
      });
      setName('');
      setPrice('');
      setCommission('8000');
      await fetchCategories();
      Alert.alert('Sukses', 'Jenis motor, tarif, dan komisi baru disimpan.');
    } catch (e) {
      Alert.alert('Gagal', 'Gagal menyimpan jenis motor.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategoryEdit = async (id: number) => {
    try {
      await db.update(vehicleCategories).set({
        price: parseInt(editPrice, 10) || 0,
        commission: parseInt(editCommission, 10) || 5000,
      }).where(eq(vehicleCategories.id, id));
      setEditingId(null);
      await fetchCategories();
      Alert.alert('Sukses', 'Tarif dan komisi berhasil diperbarui.');
    } catch (e) {
      Alert.alert('Gagal', 'Gagal memperbarui kategori motor.');
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await db.update(vehicleCategories).set({ status: nextStatus }).where(eq(vehicleCategories.id, id));
      await fetchCategories();
    } catch (e) {
      Alert.alert('Gagal', 'Gagal memperbarui status motor.');
    }
  };

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ThemedView type="backgroundElement" style={styles.modalSubScreen}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="arrow-back" size={24} color="#1E293B" />
              </TouchableOpacity>
              <ThemedText type="default" style={styles.modalSubTitle}>Jenis Motor, Tarif & Komisi</ThemedText>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 220 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <ThemedText style={styles.inputLabel}>Tambah Jenis Motor & Tarif Baru</ThemedText>
          <TextInput
            style={[styles.textInput, { marginBottom: 10 }]}
            placeholder="Contoh: Motor Kopling (Vixion, CB150R)"
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.inputLabel}>Tarif Cuci (Rp)</ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="20000"
                placeholderTextColor="#94A3B8"
                value={price}
                onChangeText={setPrice}
                keyboardType="number-pad"
              />
            </View>

            <View style={{ flex: 1 }}>
              <ThemedText style={styles.inputLabel}>Komisi Karyawan (Rp)</ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="8000"
                placeholderTextColor="#94A3B8"
                value={commission}
                onChangeText={setCommission}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleAddCategory} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <ThemedText style={styles.saveBtnText}>+ Simpan Jenis Motor</ThemedText>}
          </TouchableOpacity>

          <ThemedText style={[styles.inputLabel, { marginTop: 24 }]}>Daftar Motor, Tarif & Komisi Aktif</ThemedText>
          {categoriesList.map((cat: any) => (
            <View key={cat.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>{cat.name}</ThemedText>
                  <ThemedText style={{ fontSize: 13, color: '#1E293B', fontWeight: '700', marginTop: 2 }}>
                    Tarif Cuci: <ThemedText style={{ color: '#2563EB' }}>{formatRp(cat.price)}</ThemedText>
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, color: '#10B981', fontWeight: '700', marginTop: 2 }}>
                    Komisi Karyawan: {formatRp(cat.commission || 5000)} / motor
                  </ThemedText>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    style={{ padding: 6, backgroundColor: '#EFF6FF', borderRadius: 8 }}
                    onPress={() => {
                      setEditingId(cat.id);
                      setEditPrice(String(cat.price));
                      setEditCommission(String(cat.commission || 5000));
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color="#2563EB" />
                  </TouchableOpacity>

                  <Switch
                    value={cat.status === 'active'}
                    onValueChange={() => handleToggleStatus(cat.id, cat.status)}
                  />
                </View>
              </View>

              {/* Inline Edit */}
              {editingId === cat.id && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 10 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>Edit Tarif & Komisi</ThemedText>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontSize: 10, color: '#64748B' }}>Tarif Cuci (Rp)</ThemedText>
                      <TextInput
                        style={styles.textInput}
                        keyboardType="numeric"
                        value={editPrice}
                        onChangeText={setEditPrice}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontSize: 10, color: '#64748B' }}>Komisi Karyawan (Rp)</ThemedText>
                      <TextInput
                        style={styles.textInput}
                        keyboardType="numeric"
                        value={editCommission}
                        onChangeText={setEditCommission}
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#10B981', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                      onPress={() => handleSaveCategoryEdit(cat.id)}
                    >
                      <ThemedText style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>Simpan Edit</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                      onPress={() => setEditingId(null)}
                    >
                      <ThemedText style={{ color: '#64748B', fontWeight: '700', fontSize: 12 }}>Batal</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
            </KeyboardAvoidingView>
          </ThemedView>
        </TouchableWithoutFeedback>
      </Modal>
  );
}

// ==========================================
// 3. MODAL SETTING STRUK & PRINTER
// ==========================================
function PrinterSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const store = useSettingsStore();
  const [bizName, setBizName] = useState(store.businessName);
  const [bizAddr, setBizAddr] = useState(store.businessAddress);
  const [bizPhone, setBizPhone] = useState(store.businessPhone);
  const [thankMsg, setThankMsg] = useState(store.thankYouMessage);
  const [saving, setSaving] = useState(false);

  const [pairedDevices, setPairedDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (visible) {
      setBizName(store.businessName);
      setBizAddr(store.businessAddress);
      setBizPhone(store.businessPhone);
      setThankMsg(store.thankYouMessage);
      fetchPairedDevices();
    }
  }, [visible, store]);

  const fetchPairedDevices = async () => {
    setScanning(true);
    try {
      const devs = await getNativePairedDevices();
      setPairedDevices(devs);
    } catch (e) {
      console.log('Fetch devices error:', e);
    } finally {
      setScanning(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await store.updateSettings({
        businessName: bizName,
        businessAddress: bizAddr,
        businessPhone: bizPhone,
        thankYouMessage: thankMsg,
      });
      Alert.alert('Berhasil', 'Pengaturan struk berhasil disimpan!');
    } catch (error) {
      Alert.alert('Gagal', 'Gagal memperbarui pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ThemedView type="backgroundElement" style={styles.modalSubScreen}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="arrow-back" size={24} color="#1E293B" />
              </TouchableOpacity>
              <ThemedText type="default" style={styles.modalSubTitle}>Printer & Struktur Struk</ThemedText>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 220 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <ThemedText style={styles.inputLabel}>Nama Usaha (Header Struk)</ThemedText>
            <TextInput style={[styles.textInput, { marginBottom: 12 }]} placeholder="Nama Usaha" placeholderTextColor="#94A3B8" value={bizName} onChangeText={setBizName} />

            <ThemedText style={styles.inputLabel}>Alamat Struk</ThemedText>
            <TextInput style={[styles.textInput, { marginBottom: 12 }]} placeholder="Alamat Usaha" placeholderTextColor="#94A3B8" value={bizAddr} onChangeText={setBizAddr} />

            <ThemedText style={styles.inputLabel}>Nomor Telepon</ThemedText>
            <TextInput style={[styles.textInput, { marginBottom: 12 }]} placeholder="Nomor Telepon" placeholderTextColor="#94A3B8" value={bizPhone} onChangeText={setBizPhone} keyboardType="phone-pad" />

            <ThemedText style={styles.inputLabel}>Pesan Penutup Struk</ThemedText>
            <TextInput style={[styles.textInput, { marginBottom: 20 }]} placeholder="Pesan Penutup" placeholderTextColor="#94A3B8" value={thankMsg} onChangeText={setThankMsg} />

            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSaveSettings}>
              {saving ? <ActivityIndicator color="#FFF" /> : <ThemedText style={styles.saveBtnText}>Simpan Pengaturan Struk</ThemedText>}
            </TouchableOpacity>

            {/* Sesi Pengujian & Cetak Ke Printer Bluetooth Thermal */}
            <ThemedText style={[styles.inputLabel, { marginTop: 30 }]}>Koneksi Printer Bluetooth Thermal (58mm)</ThemedText>
            <ThemedView type="backgroundElement" style={styles.printerScannerCard}>
              <Ionicons name="print-outline" size={32} color="#2563EB" />
              <ThemedText style={styles.scanText}>
                Fitur Cetak Native Murni: Aplikasi Koko Motowash terhubung langsung ke socket Bluetooth printer Anda tanpa memerlukan aplikasi tambahan.
              </ThemedText>
              
              <TouchableOpacity
                style={[styles.scanBtn, { backgroundColor: '#8B5CF6', marginBottom: 10 }]}
                onPress={openBluetoothSettings}
              >
                <Ionicons name="bluetooth" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <ThemedText style={styles.scanBtnText}>Buka Bluetooth HP & Pair Printer Baru</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scanBtn, { backgroundColor: '#0284C7', marginBottom: 10 }]}
                onPress={fetchPairedDevices}
                disabled={scanning}
              >
                {scanning ? (
                  <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                )}
                <ThemedText style={styles.scanBtnText}>
                  {scanning ? 'Memindai Device HP...' : 'Pindai Device Paired Native'}
                </ThemedText>
              </TouchableOpacity>

              {pairedDevices.length > 0 && (
                <View style={{ width: '100%', marginTop: 8, marginBottom: 12 }}>
                  <ThemedText style={{ fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 }}>
                    Device Paired Terdeteksi:
                  </ThemedText>
                  {pairedDevices.map((dev, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={{
                        padding: 10,
                        backgroundColor: store.printerMacAddress === dev.address ? '#EFF6FF' : '#F1F5F9',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: store.printerMacAddress === dev.address ? '#2563EB' : '#CBD5E1',
                        marginBottom: 6,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        store.updateSettings({
                          printerName: dev.name,
                          printerMacAddress: dev.address,
                        });
                        Alert.alert('Device Dipilih', `Printer ${dev.name} (${dev.address}) telah disimpan sebagai printer utama.`);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ fontSize: 13, fontWeight: 'bold', color: '#1E293B' }}>{dev.name}</ThemedText>
                        <ThemedText style={{ fontSize: 11, color: '#64748B' }}>MAC: {dev.address}</ThemedText>
                      </View>
                      {store.printerMacAddress === dev.address && (
                        <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.scanBtn}
                onPress={async () => {
                  try {
                    await printReceiptThermal({
                      businessName: bizName || store.businessName,
                      businessAddress: bizAddr || store.businessAddress,
                      businessPhone: bizPhone || store.businessPhone,
                      thankYouMessage: thankMsg || store.thankYouMessage,
                      transactionNumber: 'TEST-001',
                      createdAt: new Date().toISOString(),
                      plateNumber: 'DD 1234 TEST',
                      vehicleCategoryName: 'Motor Bebek / Matic',
                      employeeName: 'Kasir Uji Coba',
                      paymentMethod: 'Tunai',
                      originalPrice: 15000,
                      finalPrice: 15000,
                    }, store.printerMacAddress);
                  } catch (e) {
                    Alert.alert('Gagal Cetak', 'Terjadi kesalahan saat memproses cetakan uji coba.');
                  }
                }}
              >
                <Ionicons name="print" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <ThemedText style={styles.scanBtnText}>Tes Cetak Struk Native (Direct Socket)</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ScrollView>
            </KeyboardAvoidingView>
          </ThemedView>
        </TouchableWithoutFeedback>
      </Modal>
  );
}

// ==========================================
// 4. MODAL BACKUP & RESTORE DATA
// ==========================================
function BackupRestoreModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [processing, setProcessing] = useState(false);
  const settingsStore = useSettingsStore();

  const handleExportBackup = async () => {
    setProcessing(true);
    try {
      // 1. Ambil data dari semua tabel SQLite
      const catsData = await db.select().from(vehicleCategories);
      const empsData = await db.select().from(employees);
      const txsData = await db.select().from(transactions);
      const cancelsData = await db.select().from(transactionCancellations);
      const settingsData = await db.select().from(settings);

      // 2. Susun payload file backup JSON
      const backupPayload = {
        metadata: {
          appName: 'Koko Motowash Backup',
          date: new Date().toISOString(),
          version: '1.0',
        },
        data: {
          vehicleCategories: catsData,
          employees: empsData,
          transactions: txsData,
          transactionCancellations: cancelsData,
          settings: settingsData,
        }
      };

      const backupStr = JSON.stringify(backupPayload, null, 2);
      const filename = `KokoMotowash_Backup_${Date.now()}.json`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      // 3. Tulis file backups ke direktori sandbox
      await FileSystem.writeAsStringAsync(fileUri, backupStr, { encoding: FileSystem.EncodingType.UTF8 });

      // 4. Buka dialog share bawaan Android
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Simpan File Backup Koko Motowash',
        });
      } else {
        throw new Error('Sharing tidak didukung.');
      }
    } catch (e: any) {
      Alert.alert('Gagal Backup', e.message || 'Pembentukan file backup gagal.');
    } finally {
      setProcessing(false);
    }
  };

  const handleImportRestore = async () => {
    // Membuka document picker
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (res.canceled) return;
      const fileUri = res.assets[0].uri;

      // Baca isi data JSON
      const contentStr = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
      const backupObj = JSON.parse(contentStr);

      // Validasi struktur JSON backup
      if (!backupObj.metadata || backupObj.metadata.appName !== 'Koko Motowash Backup') {
        throw new Error('File JSON tidak valid / bukan format backup Koko Motowash.');
      }

      // Konfirmasi bahaya menimpa data
      Alert.alert(
        'PERINGATAN RESTORE',
        'Proses restore akan menghapus seluruh data transaksi lokal saat ini dan menggantikannya dengan data backup. Apakah Anda yakin ingin melanjutkannya?',
        [
          { text: 'Batal', style: 'cancel' },
          { 
            text: 'Iya, Lanjutkan Restore', 
            style: 'destructive',
            onPress: () => executeRestore(backupObj.data)
          }
        ]
      );
    } catch (e: any) {
      Alert.alert('Gagal Restore', e.message || 'Pemasukan file restore gagal.');
    }
  };

  const executeRestore = async (backupData: any) => {
    setProcessing(true);
    try {
      await db.transaction(async (tx) => {
        // 1. Bersihkan seluruh tabel SQLite lokal saat ini
        await tx.delete(transactions);
        await tx.delete(vehicleCategories);
        await tx.delete(employees);
        await tx.delete(settings);
        await tx.delete(transactionCancellations);

        // 2. Masukkan ulang data backup
        if (backupData.vehicleCategories?.length > 0) {
          await tx.insert(vehicleCategories).values(backupData.vehicleCategories);
        }
        if (backupData.employees?.length > 0) {
          await tx.insert(employees).values(backupData.employees);
        }
        if (backupData.transactions?.length > 0) {
          await tx.insert(transactions).values(backupData.transactions);
        }
        if (backupData.transactionCancellations?.length > 0) {
          await tx.insert(transactionCancellations).values(backupData.transactionCancellations);
        }
        if (backupData.settings?.length > 0) {
          await tx.insert(settings).values(backupData.settings);
        }
      });

      // 3. Reload master stores
      await Promise.all([
        useMasterStore.getState().loadAll(),
        settingsStore.loadSettings(),
      ]);

      Alert.alert('Sukses', 'Data pemulihan (restore) berhasil diterapkan.');
    } catch (error) {
      console.error('Core restore error:', error);
      Alert.alert('Gagal', 'Restore database gagal tengah jalan.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView type="backgroundElement" style={styles.modalSubScreen}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <ThemedText type="default" style={styles.modalSubTitle}>Backup & Pemulihan Data</ThemedText>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.modalBody, { justifyContent: 'center', alignItems: 'center' }]}>
          {processing ? (
            <ActivityIndicator size="large" color="#3B82F6" />
          ) : (
            <View style={{ width: '100%', padding: 20, gap: 20 }}>
              {/* Box Backup */}
              <View style={styles.backupBox}>
                <Ionicons name="cloud-upload-outline" size={40} color="#2563EB" />
                <ThemedText style={styles.backupBoxTitle}>Backup Seluruh Data</ThemedText>
                <ThemedText style={styles.backupBoxSub}>Mengemas semua transaksi, Kategori Motor, dan Karyawan menjadi satu file .json yang aman dibagikan di Drive/WhatsApp.</ThemedText>
                <TouchableOpacity style={styles.backupBtn} onPress={handleExportBackup}>
                  <ThemedText style={styles.backupBtnText}>Ambil File Backup</ThemedText>
                </TouchableOpacity>
              </View>

              {/* Box Restore */}
              <View style={[styles.backupBox, { borderColor: '#EF4444' }]}>
                <Ionicons name="cloud-download-outline" size={40} color="#EF4444" />
                <ThemedText style={styles.backupBoxTitle}>Kembalikan Data (Restore)</ThemedText>
                <ThemedText style={styles.backupBoxSub}>Pilih file backup Koko Motowash yang tersimpan di perangkat Anda untuk memulihkan seluruh data operasional.</ThemedText>
                <TouchableOpacity style={[styles.backupBtn, { backgroundColor: '#EF4444' }]} onPress={handleImportRestore}>
                  <ThemedText style={styles.backupBtnText}>Pilih File & Restore</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  menuSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  appFooter: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  footerTextSub: {
    fontSize: 10,
    color: '#cbd5e1',
    marginTop: 2,
  },

  // Modal Screen Base
  modalSubScreen: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalSubTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
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
  inputCombinedRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addBtn: {
    width: 48,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  listItemSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  listItemSubtitleBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#93C5FD',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  printerScannerCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  scanText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
  },
  scanBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  scanBtnText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 11,
  },

  // Backup restore styles
  backupBox: {
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  backupBoxTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 8,
    marginBottom: 4,
  },
  backupBoxSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 16,
  },
  backupBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  backupBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  // Payroll Period Selector Styles
  settingCardBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
  },
  periodSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  periodOptionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  periodOptionBtnActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  periodOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  periodOptionTextActive: {
    color: '#FFFFFF',
  },
});
