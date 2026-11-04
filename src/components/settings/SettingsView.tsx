import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth, OFFICIAL_ADMIN_EMAIL } from '../../context/AuthContext';
import { useSecurity } from '../../context/SecurityContext';
import { formatDateTime } from '../../lib/calculations';
import {
  Settings,
  Building,
  Shield,
  FileCheck,
  Save,
  CheckCircle2,
  Database,
  History,
  UserCheck,
  Lock,
  KeyRound,
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
  ShieldCheck,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { companySettings, updateCompanySettings, auditLogs, seedDemoData } = useData();
  const { user, profile, isAdmin } = useAuth();
  const { lockSystem, changePin, changePassword } = useSecurity();

  const [companyName, setCompanyName] = useState(companySettings.companyName || '');
  const [tradeName, setTradeName] = useState(companySettings.tradeName || '');
  const [cnpj, setCnpj] = useState(companySettings.cnpj || '');
  const [phone, setPhone] = useState(companySettings.phone || '');
  const [whatsapp, setWhatsapp] = useState(companySettings.whatsapp || '');
  const [email, setEmail] = useState(companySettings.email || '');
  const [website, setWebsite] = useState(companySettings.website || '');
  const [address, setAddress] = useState(companySettings.address || '');
  const [city, setCity] = useState(companySettings.city || '');
  const [state, setState] = useState(companySettings.state || '');
  const [zipCode, setZipCode] = useState(companySettings.zipCode || '');
  const [pixKey, setPixKey] = useState(companySettings.pixKey || '');
  const [pixKeyType, setPixKeyType] = useState(companySettings.pixKeyType || 'CNPJ');
  const [receiptFooterMessage, setReceiptFooterMessage] = useState(
    companySettings.receiptFooterMessage || ''
  );

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [activeTab, setActiveTab] = useState<'empresa' | 'auditoria' | 'seguranca'>('empresa');

  // Segurança: Alteração de Senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passSaving, setPassSaving] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  // Segurança: Alteração de PIN
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  // Synchronize with Firestore real-time updates
  React.useEffect(() => {
    if (companySettings) {
      setCompanyName(companySettings.companyName || '');
      setTradeName(companySettings.tradeName || '');
      setCnpj(companySettings.cnpj || '');
      setPhone(companySettings.phone || '');
      setWhatsapp(companySettings.whatsapp || '');
      setEmail(companySettings.email || '');
      setWebsite(companySettings.website || '');
      setAddress(companySettings.address || '');
      setCity(companySettings.city || '');
      setState(companySettings.state || '');
      setZipCode(companySettings.zipCode || '');
      setPixKey(companySettings.pixKey || '');
      setPixKeyType(companySettings.pixKeyType || 'CNPJ');
      setReceiptFooterMessage(companySettings.receiptFooterMessage || '');
    }
  }, [companySettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('Apenas usuários administradores têm permissão para atualizar os dados da empresa.');
      return;
    }
    try {
      setSaving(true);
      await updateCompanySettings({
        companyName,
        tradeName,
        cnpj,
        phone,
        whatsapp,
        email,
        website,
        address,
        city,
        state,
        zipCode,
        pixKey,
        pixKeyType,
        receiptFooterMessage,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Error updating company settings:', err);
      alert('Erro ao salvar dados da empresa: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDemo = async () => {
    if (confirm('Deseja carregar a base de demonstração no Firebase Firestore com contratos e clientes fictícios para testes?')) {
      try {
        setSeeding(true);
        await seedDemoData();
        alert('Dados de demonstração carregados com sucesso no Firestore!');
      } catch (err) {
        console.error('Error seeding demo data:', err);
      } finally {
        setSeeding(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#30334F] flex items-center gap-2">
            <Settings className="w-6 h-6 text-[#F28C1B]" />
            Configurações do Sistema & Auditoria
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Personalização da empresa, recibos SVG, controle de permissões e registros de auditoria
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="px-3.5 py-2 bg-white hover:bg-[#F3F4F2] text-[#30334F] rounded-xl text-xs font-bold border border-[#E2E4E0] flex items-center gap-1.5 transition disabled:opacity-50 shadow-xs"
          >
            <Database className="w-4 h-4 text-emerald-600" />
            {seeding ? 'Carregando...' : 'Carregar Dados Demo'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E2E4E0] gap-4 text-xs font-bold">
        <button
          onClick={() => setActiveTab('empresa')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 ${
            activeTab === 'empresa'
              ? 'border-[#30334F] text-[#30334F]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building className="w-4 h-4 text-[#F28C1B]" />
          Dados da Empresa
        </button>

        <button
          onClick={() => setActiveTab('seguranca')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 cursor-pointer ${
            activeTab === 'seguranca'
              ? 'border-[#30334F] text-[#30334F]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-[#F28C1B]" />
          Segurança, PIN &amp; Senha
        </button>

        <button
          onClick={() => setActiveTab('auditoria')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 ${
            activeTab === 'auditoria'
              ? 'border-[#30334F] text-[#30334F]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4 text-[#F28C1B]" />
          Trilha de Auditoria ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: DADOS DA EMPRESA */}
      {activeTab === 'empresa' && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#E2E4E0] rounded-2xl p-6 shadow-xs space-y-6">
          {saveSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Dados da empresa atualizados com sucesso no Firestore! Recibos e cobranças já utilizam as informações atualizadas.</span>
            </div>
          )}

          {!isAdmin && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Modo Somente Leitura:</strong> Apenas usuários administradores possuem autorização para alterar os dados cadastrais da empresa.
              </span>
            </div>
          )}

          {/* Official Brand Identity Cards */}
          <div className="p-4 bg-[#F8F9FA] border border-[#E2E4E0] rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-2">
                <Building className="w-4 h-4 text-[#F28C1B]" />
                Identidade Visual Oficial AUTOTEC
              </span>
              <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                Ativo no Sistema & Recibos
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Dark Theme Header Logo Preview */}
              <div className="p-3.5 bg-[#30334F] rounded-xl border border-[#23253B] flex items-center gap-4">
                <div className="h-14 w-32 bg-[#25283D] rounded-lg p-2 flex items-center justify-center shrink-0 border border-white/10">
                  <img
                    src="/autotec-logo-header.png"
                    alt="Logo Cabeçalho"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">Versão Cabeçalho (Fundo Escuro #30334F)</h5>
                  <p className="text-2xs text-white/75 mt-0.5">
                    Carro e nome AUTOTEC em branco/destaque, detalhes em laranja com fundo transparente.
                  </p>
                </div>
              </div>

              {/* Light Theme Receipt Logo Preview */}
              <div className="p-3.5 bg-white rounded-xl border border-[#E2E4E0] flex items-center gap-4">
                <div className="h-14 w-32 bg-[#F3F4F2] rounded-lg p-2 flex items-center justify-center shrink-0 border border-[#DCE0D9]">
                  <img
                    src="/autotec-logo-original.png"
                    alt="Logo Recibos"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-[#30334F]">Versão Recibos SVG (Fundo Claro)</h5>
                  <p className="text-2xs text-slate-500 mt-0.5">
                    Cores oficiais: Azul-marinho #30334F e Laranja #F28C1B para visualização e impressão nítidas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Institutional Identification */}
          <div className="space-y-4">
            <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-2 border-b border-[#E2E4E0] pb-2">
              <Building className="w-4 h-4 text-[#F28C1B]" />
              Identificação Institucional
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  Nome da Empresa (Razão Social) *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={!isAdmin || saving}
                  required
                  placeholder="Ex: AUTOTEC RASTREAMENTO VEICULAR LTDA"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  Nome Fantasia
                </label>
                <input
                  type="text"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="Ex: AUTOTEC Rastreamento"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  CNPJ ou CPF *
                </label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  disabled={!isAdmin || saving}
                  required
                  placeholder="00.000.000/0001-00 ou 000.000.000-00"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  Telefone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="(00) 0000-0000"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  WhatsApp
                </label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="(00) 90000-0000"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="contato@autotec.com.br"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  Site (Opcional)
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="www.autotec.com.br"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Address */}
          <div className="space-y-4 pt-2">
            <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-2 border-b border-[#E2E4E0] pb-2">
              <Building className="w-4 h-4 text-[#F28C1B]" />
              Endereço & Localização
            </h4>

            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Endereço Completo
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!isAdmin || saving}
                placeholder="Ex: Av. Paulista, 1000, Bela Vista"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  Cidade
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="São Paulo"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  Estado (UF)
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={!isAdmin || saving}
                  maxLength={2}
                  placeholder="SP"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] uppercase focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                  CEP
                </label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="01310-100"
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Section 3: PIX Settings */}
          <div className="p-4 bg-orange-50/50 border border-orange-200 rounded-xl space-y-3">
            <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[#F28C1B]" />
              Dados do PIX para Cobrança e Recibos (Opcional)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-2xs font-bold text-slate-600 mb-1">
                  Chave PIX (Opcional)
                </label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder="Ex: CNPJ, E-mail, Celular ou Chave Aleatória"
                  className="w-full bg-white border border-[#DCE0D9] rounded-lg px-3 py-2 text-xs text-[#1E2235] font-mono focus:outline-hidden focus:border-[#30334F] disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-2xs font-bold text-slate-600 mb-1">
                  Tipo da Chave
                </label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value)}
                  disabled={!isAdmin || saving}
                  className="w-full bg-white border border-[#DCE0D9] rounded-lg px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                  <option value="Telefone">Telefone</option>
                  <option value="E-mail">E-mail</option>
                  <option value="Aleatória">Chave Aleatória (EVP)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: SVG Receipt Custom Message */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Mensagem de Agradecimento e Rodapé do Recibo SVG
            </label>
            <textarea
              rows={2}
              value={receiptFooterMessage}
              onChange={(e) => setReceiptFooterMessage(e.target.value)}
              disabled={!isAdmin || saving}
              placeholder="Ex: Agradecemos a preferência em nossos serviços de rastreamento veicular!"
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white resize-none disabled:opacity-70 disabled:cursor-not-allowed"
            />
          </div>

          {isAdmin ? (
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 flex items-center gap-2 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Gravando no Firestore...' : 'Salvar Dados da Empresa'}
              </button>
            </div>
          ) : (
            <div className="pt-2 flex justify-end">
              <span className="text-2xs text-slate-500 font-medium italic">
                Edição restrita a Administradores do sistema.
              </span>
            </div>
          )}
        </form>
      )}

      {/* TAB 2: SEGURANÇA, PIN & SENHA */}
      {activeTab === 'seguranca' && (
        <div className="space-y-6">
          {/* Header Card: Exclusive Owner & Inactivity Info */}
          <div className="bg-white border border-[#E2E4E0] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E4E0]">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#30334F]/10 text-[#30334F] rounded-xl">
                  <ShieldCheck className="w-6 h-6 text-[#F28C1B]" />
                </div>
                <div>
                  <h3 className="font-bold text-[#30334F] text-base">Acesso Exclusivo &amp; Segurança Local</h3>
                  <p className="text-xs text-slate-500">
                    Proprietário único oficial: <strong className="text-[#30334F] font-mono">{OFFICIAL_ADMIN_EMAIL}</strong>
                  </p>
                </div>
              </div>

              {/* Botão de Bloqueio Imediato */}
              <button
                type="button"
                onClick={lockSystem}
                className="px-4 py-2.5 bg-[#30334F] hover:bg-[#222538] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-xs cursor-pointer shrink-0"
              >
                <Lock className="w-4 h-4 text-[#F28C1B]" />
                Bloquear Sistema Agora
              </button>
            </div>

            {/* Informative Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[#30334F]">
                  <KeyRound className="w-4 h-4 text-[#F28C1B]" />
                  PIN Criptográfico
                </div>
                <p className="text-2xs text-slate-600 leading-relaxed">
                  Derivado via <strong>PBKDF2-HMAC-SHA256</strong> (100.000 iterações com salt aleatório). NUNCA gravado em texto plano.
                </p>
              </div>

              <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[#30334F]">
                  <Clock className="w-4 h-4 text-[#F28C1B]" />
                  Bloqueio por Inatividade
                </div>
                <p className="text-2xs text-slate-600 leading-relaxed">
                  Bloqueio automático após <strong>5 minutos</strong> sem atividade ou ao retornar de aba inativa.
                </p>
              </div>

              <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[#30334F]">
                  <Shield className="w-4 h-4 text-[#059669]" />
                  Proteção Contra Força Bruta
                </div>
                <p className="text-2xs text-slate-600 leading-relaxed">
                  Atraso progressivo e bloqueio temporário após 5 tentativas incorretas consecutivas.
                </p>
              </div>
            </div>
          </div>

          {/* Grid de Formulários: Alterar PIN e Alterar Senha */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* FORMULÁRIO 1: ALTERAR PIN DE 6 DÍGITOS */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPinError(null);
                setPinSuccess(null);

                if (!currentPin || currentPin.length !== 6 || !/^\d{6}$/.test(currentPin)) {
                  setPinError('O PIN atual deve conter exatamente 6 dígitos numéricos.');
                  return;
                }
                if (!newPin || newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
                  setPinError('O novo PIN deve conter exatamente 6 dígitos numéricos.');
                  return;
                }
                if (newPin !== confirmPin) {
                  setPinError('A confirmação não coincide com o novo PIN digitado.');
                  return;
                }
                if (currentPin === newPin) {
                  setPinError('O novo PIN deve ser diferente do PIN atual.');
                  return;
                }

                try {
                  setPinSaving(true);
                  const res = await changePin(currentPin, newPin);
                  if (res.success) {
                    setPinSuccess('PIN de 6 dígitos alterado com sucesso!');
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                    setTimeout(() => setPinSuccess(null), 4000);
                  } else {
                    setPinError(res.error || 'Erro ao alterar o PIN.');
                  }
                } catch (err: any) {
                  setPinError(err?.message || 'Falha ao atualizar o PIN.');
                } finally {
                  setPinSaving(false);
                }
              }}
              className="bg-white border border-[#E2E4E0] rounded-2xl p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-[#E2E4E0]">
                <KeyRound className="w-5 h-5 text-[#F28C1B]" />
                <div>
                  <h4 className="text-sm font-bold text-[#30334F]">Alterar PIN de Desbloqueio (6 Dígitos)</h4>
                  <p className="text-2xs text-slate-500">Atualize o código numérico de acesso rápido local</p>
                </div>
              </div>

              {pinSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{pinSuccess}</span>
                </div>
              )}

              {pinError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1">
                  PIN Atual (6 Dígitos) *
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPin ? 'text' : 'password'}
                    maxLength={6}
                    pattern="\d{6}"
                    inputMode="numeric"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    required
                    className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-sm font-mono tracking-widest text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPin(!showCurrentPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1">
                  Novo PIN (6 Dígitos) *
                </label>
                <div className="relative">
                  <input
                    type={showNewPin ? 'text' : 'password'}
                    maxLength={6}
                    pattern="\d{6}"
                    inputMode="numeric"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    required
                    className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-sm font-mono tracking-widest text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPin(!showNewPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1">
                  Confirmar Novo PIN *
                </label>
                <input
                  type={showNewPin ? 'text' : 'password'}
                  maxLength={6}
                  pattern="\d{6}"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  required
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-sm font-mono tracking-widest text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={pinSaving || newPin.length !== 6 || confirmPin.length !== 6}
                className="w-full py-2.5 px-4 bg-[#F28C1B] hover:bg-[#d9770e] text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 transition disabled:opacity-50 cursor-pointer"
              >
                {pinSaving ? 'Atualizando PIN...' : 'Salvar Novo PIN'}
              </button>
            </form>

            {/* FORMULÁRIO 2: ALTERAR SENHA DO FIREBASE */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPassError(null);
                setPassSuccess(null);

                if (!currentPassword) {
                  setPassError('Informe a sua senha atual de acesso.');
                  return;
                }
                if (!newPassword || newPassword.length < 6) {
                  setPassError('A nova senha deve possuir pelo menos 6 caracteres.');
                  return;
                }
                if (newPassword !== confirmPassword) {
                  setPassError('A confirmação não coincide com a nova senha digitada.');
                  return;
                }
                if (currentPassword === newPassword) {
                  setPassError('A nova senha deve ser diferente da senha atual.');
                  return;
                }

                try {
                  setPassSaving(true);
                  const res = await changePassword(currentPassword, newPassword);
                  if (res.success) {
                    setPassSuccess('Senha de acesso atualizada com sucesso no Firebase Authentication!');
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setTimeout(() => setPassSuccess(null), 4000);
                  } else {
                    setPassError(res.error || 'Erro ao alterar a senha.');
                  }
                } catch (err: any) {
                  setPassError(err?.message || 'Falha ao atualizar a senha.');
                } finally {
                  setPassSaving(false);
                }
              }}
              className="bg-white border border-[#E2E4E0] rounded-2xl p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-[#E2E4E0]">
                <Lock className="w-5 h-5 text-[#30334F]" />
                <div>
                  <h4 className="text-sm font-bold text-[#30334F]">Alterar Senha da Conta (Firebase Auth)</h4>
                  <p className="text-2xs text-slate-500">Exige reautenticação imediata com sua senha atual</p>
                </div>
              </div>

              {passSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{passSuccess}</span>
                </div>
              )}

              {passError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{passError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1">
                  Senha Atual de Acesso *
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Sua senha atual"
                    required
                    className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1">
                  Nova Senha (Mínimo 6 Caracteres) *
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nova senha segura"
                    required
                    minLength={6}
                    className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#30334F] mb-1">
                  Confirmar Nova Senha *
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  required
                  minLength={6}
                  className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={passSaving || newPassword.length < 6 || confirmPassword.length < 6}
                className="w-full py-2.5 px-4 bg-[#30334F] hover:bg-[#222538] text-white rounded-xl text-xs font-bold shadow-md shadow-[#30334F]/20 transition disabled:opacity-50 cursor-pointer"
              >
                {passSaving ? 'Atualizando Senha...' : 'Salvar Nova Senha'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: AUDITORIA */}
      {activeTab === 'auditoria' && (
        <div className="bg-white border border-[#E2E4E0] rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 bg-[#F8F9FA] border-b border-[#E2E4E0] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider">
                Trilha Imutável de Auditoria (Firestore)
              </h4>
              <p className="text-2xs text-slate-500">
                Registra quem cadastrou, editou, recebeu ou movimentou valores financeiros
              </p>
            </div>
            <span className="text-2xs text-slate-500 font-mono">
              {auditLogs.length} eventos registrados
            </span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Nenhuma ação de auditoria registrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8F9FA] text-[#60677D] font-bold border-b border-[#E2E4E0] sticky top-0 uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="px-4 py-3">Data & Hora</th>
                    <th className="px-4 py-3">Operador</th>
                    <th className="px-4 py-3">Ação</th>
                    <th className="px-4 py-3">Entidade</th>
                    <th className="px-4 py-3">Detalhes da Operação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E4E0]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F8F9FB] transition">
                      <td className="px-4 py-3 text-slate-600 font-mono text-2xs whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-[#30334F] font-bold whitespace-nowrap">
                        {log.operatorEmail}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-2xs px-2 py-0.5 rounded font-mono font-bold ${
                            log.action === 'PAYMENT'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : log.action === 'DELETE'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : log.action === 'CREATE'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{log.entity}</td>
                      <td className="px-4 py-3 text-slate-600">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
