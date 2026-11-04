import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
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
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { companySettings, updateCompanySettings, auditLogs, seedDemoData } = useData();
  const { user, profile, isAdmin } = useAuth();

  const [companyName, setCompanyName] = useState(companySettings.companyName || '');
  const [tradeName, setTradeName] = useState(companySettings.tradeName || '');
  const [cnpj, setCnpj] = useState(companySettings.cnpj || '');
  const [phone, setPhone] = useState(companySettings.phone || '');
  const [whatsapp, setWhatsapp] = useState(companySettings.whatsapp || '');
  const [email, setEmail] = useState(companySettings.email || '');
  const [pixKey, setPixKey] = useState(companySettings.pixKey || '');
  const [pixKeyType, setPixKeyType] = useState(companySettings.pixKeyType || 'CNPJ');
  const [address, setAddress] = useState(companySettings.address || '');
  const [receiptFooterMessage, setReceiptFooterMessage] = useState(
    companySettings.receiptFooterMessage || ''
  );

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [activeTab, setActiveTab] = useState<'empresa' | 'auditoria' | 'permissoes'>('empresa');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await updateCompanySettings({
        companyName,
        tradeName,
        cnpj,
        phone,
        whatsapp,
        email,
        pixKey,
        pixKeyType,
        address,
        receiptFooterMessage,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error updating company settings:', err);
      alert('Erro ao salvar configurações.');
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
          Dados da Empresa & Recibo SVG
        </button>

        <button
          onClick={() => setActiveTab('permissoes')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 ${
            activeTab === 'permissoes'
              ? 'border-[#30334F] text-[#30334F]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-4 h-4 text-[#F28C1B]" />
          Usuários & Permissões (RBAC)
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

      {/* TAB 1: EMPRESA */}
      {activeTab === 'empresa' && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#E2E4E0] rounded-2xl p-6 shadow-xs space-y-6">
          {saveSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Configurações atualizadas com sucesso no Firestore!</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Razão Social da Empresa *
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
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
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                CNPJ *
              </label>
              <input
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                required
                placeholder="00.000.000/0001-00"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Telefone de Contato
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 0000-0000"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                WhatsApp de Cobrança
              </label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(00) 90000-0000"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                E-mail Institucional
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="financeiro@empresa.com"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#30334F] mb-1.5">
                Endereço Completo
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Logradouro, número, bairro, cidade - UF"
                className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2.5 text-sm text-[#1E2235] focus:outline-hidden focus:border-[#30334F] focus:bg-white"
              />
            </div>
          </div>

          {/* PIX Settings */}
          <div className="p-4 bg-orange-50/50 border border-orange-200 rounded-xl space-y-3">
            <h4 className="text-xs font-black text-[#30334F] uppercase tracking-wider flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[#F28C1B]" />
              Dados do PIX para Cobrança e Recibos
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-2xs font-bold text-slate-600 mb-1">
                  Chave PIX
                </label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="Ex: CNPJ, E-mail, Celular ou Chave Aleatória"
                  className="w-full bg-white border border-[#DCE0D9] rounded-lg px-3 py-2 text-xs text-[#1E2235] font-mono focus:outline-hidden focus:border-[#30334F]"
                />
              </div>
              <div>
                <label className="block text-2xs font-bold text-slate-600 mb-1">
                  Tipo da Chave
                </label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value)}
                  className="w-full bg-white border border-[#DCE0D9] rounded-lg px-3 py-2 text-xs text-[#1E2235] focus:outline-hidden focus:border-[#30334F]"
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

          {/* SVG Receipt Custom Message */}
          <div>
            <label className="block text-xs font-bold text-[#30334F] mb-1.5">
              Mensagem de Agradecimento e Rodapé do Recibo SVG
            </label>
            <textarea
              rows={2}
              value={receiptFooterMessage}
              onChange={(e) => setReceiptFooterMessage(e.target.value)}
              placeholder="Ex: Agradecemos a preferência em nossos serviços de rastreamento veicular!"
              className="w-full bg-[#F8F9FA] border border-[#DCE0D9] rounded-xl px-3.5 py-2 text-xs text-[#1E2235] placeholder-slate-400 focus:outline-hidden focus:border-[#30334F] focus:bg-white resize-none"
            />
          </div>

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
        </form>
      )}

      {/* TAB 2: PERMISSÕES & USUÁRIOS */}
      {activeTab === 'permissoes' && (
        <div className="bg-white border border-[#E2E4E0] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#30334F]/10 text-[#30334F] rounded-xl">
              <Shield className="w-6 h-6 text-[#F28C1B]" />
            </div>
            <div>
              <h3 className="font-bold text-[#30334F] text-base">Controle de Acesso Baseado em Papéis (RBAC)</h3>
              <p className="text-xs text-slate-500">
                Segurança validada nas regras do Firestore (firestore.rules)
              </p>
            </div>
          </div>

          {/* Current User Session Profile */}
          <div className="p-4 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-2">
            <span className="text-2xs uppercase font-bold text-slate-500 block">
              Sessão Conectada no Firebase Auth
            </span>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-[#30334F] text-sm">
                  {profile?.displayName || user?.displayName || 'Usuário Conectado'}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {user?.email || 'email@google.com'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    isAdmin
                      ? 'bg-purple-50 text-purple-800 border-purple-200'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
                  }`}
                >
                  Papel: {isAdmin ? 'ADMINISTRADOR' : 'OPERADOR'}
                </span>
              </div>
            </div>
          </div>

          {/* Roles Description Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
                <Shield className="w-4 h-4" />
                Perfil: Administrador
              </div>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li>Acesso total a todas as configurações da empresa e PIX.</li>
                <li>Permissão de exclusão de clientes, veículos e planos.</li>
                <li>Consulta irrestrita a todos os relatórios e logs de auditoria.</li>
                <li>E-mail bootstrap administrativo: <strong className="text-[#30334F]">primecell435@gmail.com</strong>.</li>
              </ul>
            </div>

            <div className="p-4 bg-[#F8F9FA] border border-[#E2E4E0] rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-[#30334F] font-bold text-sm">
                <UserCheck className="w-4 h-4 text-[#F28C1B]" />
                Perfil: Operador
              </div>
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li>Cadastro e edição de clientes e veículos da frota.</li>
                <li>Lançamento e registro de recebimentos integrais e parciais.</li>
                <li>Emissão e envio de recibos em SVG aos clientes.</li>
                <li>Acionamento de cobranças pelo WhatsApp.</li>
                <li>Proibido de excluir registros sem autorização administrativa.</li>
              </ul>
            </div>
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
