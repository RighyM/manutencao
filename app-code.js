window.__buildImxApp = function(require, AppSecrets) {
const ComponentFunction = function() {
  // @section:imports @depends:[]
  const React = require('react');
  const { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, StatusBar, Platform, Alert, Image, useWindowDimensions } = require('react-native');
  const { Ionicons } = require('@react-native-vector-icons/ionicons');
  const { createBottomTabNavigator } = require('@react-navigation/bottom-tabs');
  const { createStackNavigator } = require('@react-navigation/stack');
  const { useSafeAreaInsets } = require('react-native-safe-area-context');
  const { useCamera, useBarcodeScanner, useStorage } = require('platform-hooks');
  // Banco central (Supabase): login, leitura, gravação e atualização em tempo real
  const { createClient } = require('@supabase/supabase-js');
  var SUPABASE_URL = (typeof AppSecrets !== 'undefined' && AppSecrets && AppSecrets.SUPABASE_URL) || 'https://nmzoxrykcoolvptstiwx.supabase.co';
  var SUPABASE_ANON_KEY = (typeof AppSecrets !== 'undefined' && AppSecrets && AppSecrets.SUPABASE_ANON_KEY) || 'COLE_AQUI_A_CHAVE_ANON';
  var DB_TABLES = ['machines', 'maintenance_tasks', 'corrective_calls', 'repair_components'];
  var IMX = globalThis.__imxDb || (globalThis.__imxDb = { client: null, cache: {}, listeners: {}, loading: {}, channel: null, profile: null });
  var dbConfigured = function() { return !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.indexOf('COLE_AQUI') !== 0; };
  var getDb = function() {
    if (!dbConfigured()) return null;
    if (!IMX.client) {
      IMX.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: typeof localStorage !== 'undefined' ? localStorage : undefined }
      });
    }
    return IMX.client;
  };
  var friendlyDbError = function(error) {
    var text = String((error && (error.message || error.error_description)) || error || '');
    if (/row-level security|permission denied|violates row-level/i.test(text)) return 'Você não tem permissão para fazer esta alteração.';
    if (/Invalid login credentials/i.test(text)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(text)) return 'Confirme seu e-mail pelo link que enviamos e depois entre.';
    if (/already registered|already been registered/i.test(text)) return 'Este e-mail já tem conta. Use Entrar.';
    if (/Password should be at least/i.test(text)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/Failed to fetch|Network|network request failed/i.test(text)) return 'Sem conexão com o banco. Verifique a internet e tente de novo.';
    return text || 'Não foi possível concluir. Tente de novo.';
  };
  var rowToRecord = function(row) { return Object.assign({}, row.data || {}, { id: row.id, updated_at: row.updated_at }); };
  var notifyTable = function(table) { (IMX.listeners[table] || []).slice().forEach(function(fn) { fn(); }); };
  var loadTable = function(table) {
    var db = getDb();
    if (!db) return Promise.resolve([]);
    IMX.loading[table] = true;
    var all = [];
    var page = function(from) {
      return db.from(table).select('id,data,updated_at').order('id').range(from, from + 999).then(function(result) {
        if (result.error) throw result.error;
        all = all.concat(result.data || []);
        return (result.data || []).length === 1000 ? page(from + 1000) : all;
      });
    };
    return page(0).then(function(rows) {
      IMX.cache[table] = rows.map(rowToRecord);
      IMX.loading[table] = false;
      notifyTable(table);
      return IMX.cache[table];
    }).catch(function(error) {
      IMX.loading[table] = false;
      throw new Error(friendlyDbError(error));
    });
  };
  var putInCache = function(table, record) {
    var list = (IMX.cache[table] || []).filter(function(item) { return item.id !== record.id; });
    IMX.cache[table] = list.concat([record]);
    notifyTable(table);
  };
  var startRealtime = function() {
    var db = getDb();
    if (!db || IMX.channel) return;
    try {
      var channel = db.channel('imx-mudancas');
      DB_TABLES.forEach(function(table) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: table }, function(payload) {
          if (payload.eventType === 'DELETE') {
            var oldId = payload.old && payload.old.id;
            IMX.cache[table] = (IMX.cache[table] || []).filter(function(item) { return item.id !== oldId; });
            notifyTable(table);
          } else if (payload.new && payload.new.id) {
            putInCache(table, rowToRecord(payload.new));
          }
        });
      });
      channel.subscribe();
      IMX.channel = channel;
    } catch (error) {
      IMX.channel = null;
    }
  };
  var stopRealtime = function() {
    var db = getDb();
    if (db && IMX.channel) { try { db.removeChannel(IMX.channel); } catch (error) {} }
    IMX.channel = null;
  };
  var resetDbCache = function() { IMX.cache = {}; IMX.loading = {}; IMX.profile = null; stopRealtime(); };
  var currentUserName = function() { return (IMX.profile && IMX.profile.full_name) || null; };
  var isLegacySample = function(row) {
    if (!row) return false;
    if (/__urdume$/.test(String(row.routine_id || ''))) return true;
    return ['machine_id', 'origin_machine_id', 'installed_machine_id'].some(function(key) { return String(row[key] || '').indexOf('sample-machines-') === 0; });
  };
  var machineOrder = function(a, b) {
    var codeA = String((a && a.machine_code) || '');
    var codeB = String((b && b.machine_code) || '');
    var numA = parseInt(codeA, 10);
    var numB = parseInt(codeB, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return codeA.localeCompare(codeB);
  };
  var useQuery = function(table) {
    var tickState = React.useState(0);
    var setTick = tickState[1];
    React.useEffect(function() {
      var listener = function() { setTick(function(value) { return value + 1; }); };
      IMX.listeners[table] = (IMX.listeners[table] || []).concat([listener]);
      if (!IMX.cache[table] && !IMX.loading[table]) loadTable(table).catch(function() {});
      return function() { IMX.listeners[table] = (IMX.listeners[table] || []).filter(function(item) { return item !== listener; }); };
    }, [table]);
    var rows = IMX.cache[table];
    var data = React.useMemo(function() {
      var kept = (rows || []).filter(function(row) { return row && !isLegacySample(row); });
      return table === 'machines' ? kept.slice().sort(machineOrder) : kept;
    }, [rows, table]);
    return { data: data, loading: !rows, refetch: function() { return loadTable(table); } };
  };
  var useMutation = function(table, operation) {
    var mutate = function(input) {
      var db = getDb();
      if (!db) return Promise.reject(new Error('O app ainda não está ligado ao banco central.'));
      var request;
      if (operation === 'update') {
        var current = (IMX.cache[table] || []).find(function(item) { return item.id === input.id; }) || {};
        var merged = Object.assign({}, current, input.data || {});
        delete merged.id;
        delete merged.updated_at;
        request = db.from(table).update({ data: merged }).eq('id', input.id).select('id,data,updated_at');
      } else if (operation === 'delete') {
        request = db.from(table).delete().eq('id', input.id || input).select('id');
      } else {
        var payload = Object.assign({}, input || {});
        var row = { data: payload };
        if (payload.id) { row.id = String(payload.id); delete payload.id; }
        request = db.from(table).insert(row).select('id,data,updated_at');
      }
      return request.then(function(result) {
        if (result.error) throw result.error;
        var saved = (result.data || [])[0];
        if (!saved) throw new Error('Você não tem permissão para fazer esta alteração.');
        if (operation === 'delete') {
          IMX.cache[table] = (IMX.cache[table] || []).filter(function(item) { return item.id !== saved.id; });
          notifyTable(table);
          return { data: saved };
        }
        var record = rowToRecord(saved);
        putInCache(table, record);
        return { data: record };
      }).catch(function(error) { throw new Error(friendlyDbError(error)); });
    };
    return { mutate: mutate };
  };
  // @end:imports

  // @section:theme @depends:[]
  const PRIMARY = '#12313A';
  const ACCENT = '#F2A541';
  const BACKGROUND = '#EAF0EF';
  const CARD = '#FFFFFF';
  const TEXT = '#142B32';
  const SECONDARY = '#52676C';
  const BORDER = '#CBD7D6';
  const RED = '#9B3D38';
  const GREEN = '#28634E';
  const PALE = '#F5F8F7';
  const visualDesign = 'Quadro de ordens de serviço com faixas de situação, etiquetas legíveis e controles amplos.';
  var TAB_MENU_HEIGHT = Platform.OS === 'web' ? 56 : 49;
  var SCROLL_EXTRA_PADDING = 16;
  var FAB_SPACING = 16;
  // @end:theme

  // @section:navigation-setup @depends:[]
  var Tab = createBottomTabNavigator();
  var Stack = createStackNavigator();
  // @end:navigation-setup

  // @section:ThemeContext @depends:[theme]
  var ThemeContext = React.createContext(null);
  var ThemeProvider = function(props) {
    var darkState = React.useState(false);
    return React.createElement(ThemeContext.Provider, {
      value: {
        theme: { colors: { primary: PRIMARY, accent: ACCENT, background: BACKGROUND, card: CARD, textPrimary: TEXT, textSecondary: SECONDARY } },
        darkMode: darkState[0],
        toggleDarkMode: function() { darkState[1](!darkState[0]); },
        visualDesign: visualDesign
      }
    }, props.children);
  };
  var useTheme = function() { return React.useContext(ThemeContext); };
  // @end:ThemeContext

  // @section:sample-data @depends:[]
  var EVENT_PERIODICITY = 'Toda troca de urdume';
  var ROUTINES = [
    ["optimax_prev__semanal", "Preventiva OPTIMAX", "preventive", "Semanal", 7],
    ["optimax_prev__quinzenal", "Preventiva OPTIMAX", "preventive", "Quinzenal", 15],
    ["optimax_prev__mensal", "Preventiva OPTIMAX", "preventive", "Mensal", 30],
    ["optimax_prev__bimestral", "Preventiva OPTIMAX", "preventive", "Bimestral", 60],
    ["optimax_prev__anual", "Preventiva OPTIMAX", "preventive", "Anual", 365],
    ["optimax_prev__bianual", "Preventiva OPTIMAX", "preventive", "Bianual", 730],
    ["optimax_lub__quinzenal", "Lubrificação OPTIMAX", "lubrication", "Quinzenal", 15],
    ["optimax_lub__mensal", "Lubrificação OPTIMAX", "lubrication", "Mensal", 30],
    ["optimax_lub__semestral", "Lubrificação OPTIMAX", "lubrication", "Semestral", 180],
    ["optimax_lub__trianual", "Lubrificação OPTIMAX", "lubrication", "Trianual", 1095],
    ["omniplus_lub__quinzenal", "Lubrificação OMNIPLUS", "lubrication", "Quinzenal", 15],
    ["omniplus_lub__mensal", "Lubrificação OMNIPLUS", "lubrication", "Mensal", 30],
    ["omniplus_lub__semestral", "Lubrificação OMNIPLUS", "lubrication", "Semestral", 180],
    ["omniplus_lub__anual", "Lubrificação OMNIPLUS", "lubrication", "Anual", 365],
    ["omniplus_prev__semanal", "Preventiva OMNIPLUS", "preventive", "Semanal", 7],
    ["omniplus_prev__mensal", "Preventiva OMNIPLUS", "preventive", "Mensal", 30],
    ["omniplus_prev__semestral", "Preventiva OMNIPLUS", "preventive", "Semestral", 180],
    ["omniplus_prev__anual", "Preventiva OMNIPLUS", "preventive", "Anual", 365]
  ];
  var ROUTINE_ITEMS = {
    "optimax_prev__semanal": [
      ["Espessura da faixa e comprimento da perfuração na pinça flexível", "Verificar", "Verifique sem retirar a pinça flexível."],
      ["Lâminas do cortador", "Verificar", "Verifique se os cortadores de trama e de refugo ainda cortam em todo o comprimento das lâminas."],
      ["Corrediças", "Limpar", ""],
      ["Tesoura da trama e cortador de refugo", "Limpar", ""]
    ],
    "optimax_prev__quinzenal": [
      ["Deslaminação das pinças flexíveis", "Verificar", ""],
      ["Desgaste da cabeça da pinça e primeiros 12 ganchos guia", "Verificar", "Verifique o desgaste na cabeça da pinça e nos primeiros 12 ganchos guia (lado esquerdo e direito); substitua se necessário."]
    ],
    "optimax_prev__mensal": [
      ["Roda dentada", "", "Virar a roda dentada para a posição seguinte à da última marcação do cronograma e marcar a posição atual."],
      ["Suporte do pente e ganchos da guia", "Verificar", "Torques: suporte do pente 9,7 Nm (inclusive os parafusos sob a corrediça); ganchos da guia 1,25 Nm."],
      ["Posição dos tempereiros (altura, profundidade e laterais)", "Verificar", ""],
      ["Tempereiros", "Verificar", "Verifique se os anéis giram com facilidade; desmonte, limpe com escova, lixe a corrosão do fuso, aplique camada fina de cera e remonte com o mesmo ajuste."],
      ["Momento do corte da tesoura da trama", "Verificar", ""],
      ["Abridor da pinça direita (máquinas sem ERGO)", "Verificar", ""],
      ["Movimento do rolo sensor durante a tecedura", "Verificar", ""],
      ["Rodas da pinça e fitas flexíveis", "Verificar", "Retire as pinças do tear e verifique as pinças flexíveis e as rodas da pinça quanto ao desgaste."],
      ["Ângulo do freio", "Verificar", ""],
      ["Tear", "Limpar", "Retire a poeira entre a engrenagem de acionamento do rolo de urdume e a engrenagem do rolo de urdume."],
      ["Rodas da pinça", "Limpar", ""]
    ],
    "optimax_prev__bimestral": [
      ["Desgaste dos ganchos guia", "Verificar", "Verifique o desgaste dos ganchos guia; se demasiadamente desgastados, substitua."]
    ],
    "optimax_prev__anual": [
      ["Filtro fino", "Trocar", ""],
      ["Cortadores de refugo", "Limpar", "Verifique os pontos de giro ao redor do eixo; lubrifique com pasta Molykote M55; após a montagem, teste o corte e a tensão da lâmina com fio de trama."]
    ],
    "optimax_prev__bianual": [
      ["Guia da pinça superior", "Verificar", ""]
    ],
    "optimax_lub__quinzenal": [
      ["Ponto de lubrificação (esq. e dir.) do porta-fio BLF", "", "Bomba · graxa tipo 3"],
      ["Tesoura mecânica — ponto de lubrificação do lado esquerdo", "", "Bomba · graxa tipo 1"]
    ],
    "optimax_lub__mensal": [
      ["Guias dianteiros e traseiros em forma de U (giro-inglês)", "", "Pincel · graxa tipo 4"],
      ["Lâminas dos cortadores de refugo (esq. e dir.)", "", "Tubo spray · spray lubrificante"]
    ],
    "optimax_lub__semestral": [
      ["Pivô (esq. e dir.) da barra antidobra", "", "Lata de óleo · óleo tipo 5"],
      ["Rolamento (esq. e dir.) do rolo de urdume", "", "Pincel · graxa tipo 1"],
      ["Ponto de lubrificação do mecanismo de engate do movimento de desenrolamento", "", "Bomba · graxa tipo 1"],
      ["Engrenagem do anel na engrenagem do rolo de urdume", "", "Pincel · graxa tipo 1"],
      ["Correia do acionador do rolo de tecido", "", "Pincel · graxa tipo 1"],
      ["Engrenagem do acionador do rolo de tecido", "", "Pincel · graxa tipo 1"],
      ["Mecanismo de engate do movimento de desenrolamento", "", "Pincel · graxa tipo 1"]
    ],
    "optimax_lub__trianual": [
      ["Troca de óleo — lubrificação circulante", "", "Menghini 8425 · óleo tipo 5"]
    ],
    "omniplus_lub__quinzenal": [
      ["Porta-fios BLF (esq. e dir.)", "", "Bomba · graxa tipo 1"],
      ["Dispositivo Elsy (guias em forma de U)", "", "Pincel · graxa tipo 4"]
    ],
    "omniplus_lub__mensal": [
      ["Rolamento do batente", "", "Bomba · graxa tipo 1"]
    ],
    "omniplus_lub__semestral": [
      ["Mecanismo de engate do rolo de urdume (esq. e dir.)", "", "Pincel · graxa tipo 1"],
      ["Rolamento do rolo de urdume (esq. e dir.)", "", "Pincel · graxa tipo 1"],
      ["Mecanismo de engate do movimento de desenrolamento", "", "Bomba · graxa tipo 1"]
    ],
    "omniplus_lub__anual": [
      ["Troca de óleo — lubrificação circulante", "", "Menghini 8425 · óleo tipo 1"]
    ],
    "omniplus_prev__semanal": [
      ["Suporte do liço lateral", "", "Se a lubrificação dos feltros ainda é suficiente"],
      ["Mecanismo para formação da cala", "", "Nível do óleo da maquineta"],
      ["Lubrificação", "", "Nível do óleo"],
      ["Lubrificação", "", "Vazamento de óleo"],
      ["Lubrificação", "", "Temperatura do óleo"],
      ["Lubrificação", "", "Atenção especial aos pontos de conexão dos tubos de óleo"]
    ],
    "omniplus_prev__mensal": [
      ["Lubrificação", "", "Limpeza dos filtros"],
      ["PFT", "", "Funcionamento e limpeza"],
      ["Ar comprimido", "", "Vazamentos de ar"]
    ],
    "omniplus_prev__semestral": [
      ["PRA", "", "Condições e posição do bocal de sucção"],
      ["Movimento rotativo do leno", "", "Montagem lateral com relação às extremidades da urdidura"],
      ["Suporte do liço lateral", "", "Condições gerais (retirar os quadros para verificar)"],
      ["Quadro", "", "Placa de metal / fundição: rachaduras visíveis"],
      ["Pré-alimentador", "", "Freio de entrada"],
      ["Pré-alimentador", "", "Sensores de sujeira"],
      ["Pré-alimentador", "", "Condições do olho de cerâmica no tubo do braço de enrolamento"],
      ["PFT", "", "Condições do olho de cerâmica e dos pinos do freio"],
      ["Bocais principais", "", "Posição e alinhamento dos bocais móveis com relação ao pente"],
      ["Bocais principais", "", "Acoplamento e condições dos tubos de ar"],
      ["Bocais principais", "", "Limpar cuidadosamente o tubo com limpador de tubos"],
      ["Bocais principais", "", "No caso de projéteis cônicos, verificar a vazão de ar"],
      ["Bocais principais", "", "Vazão de ar da pressão contínua baixa"],
      ["Bocais principais", "", "Calibragem dos parâmetros nominais Q"],
      ["Bocais principais", "", "Sem rebarbas ou desgaste nas posições de entrada e saída"],
      ["Bocais principais", "", "Bocal principal móvel 8C: rolamentos com torque de 9 Nm"],
      ["Pente", "", "Limpeza do pente"],
      ["Pente", "", "Condições gerais do pente (teste da unha)"],
      ["Pente", "", "Dentes do pente com desgaste"],
      ["Pente", "", "Vazão de ar"],
      ["Pente", "", "Altura do canal de ar com relação aos bocais auxiliares"],
      ["Bocal de estiramento", "", "Limpar o bocal de estiramento"],
      ["Detector da trama", "", "Fixação do(s) detector(es) de trama"],
      ["Detector da trama", "", "Funcionamento do detector da trama 1 (e 2) pelo teste"],
      ["Cortador da trama", "", "Limpar as lâminas e verificar se não há rebarbas"],
      ["PRA", "", "Vazão de ar do bocal de sucção"],
      ["PRA", "", "Limpar o bocal de sucção"],
      ["PRA", "", "Executar o teste PRA"],
      ["Controle pneumático", "", "Vedação de todos os reguladores de pressão"],
      ["Controle pneumático", "", "Válvulas diferentes"],
      ["Controle pneumático", "", "Condições das conexões e mangueiras de ar"],
      ["Movimento rotativo do leno", "", "Folga das bobinas no suporte"],
      ["Movimento rotativo do leno", "", "Funcionamento do detector eletrônico de ruptura do fio"],
      ["Movimento rotativo do leno", "", "Ajuste do PX"],
      ["Movimento rotativo do leno", "", "Condições e folga dos pinhões"],
      ["Movimento rotativo do leno", "", "Todas as molas"],
      ["Movimento rotativo do leno", "", "Condições da correia do acionador, dente e roda da catraca"],
      ["Movimento rotativo do leno", "", "Embreagem do eixo do acionador"],
      ["Movimento rotativo do leno", "", "Condições dos rolamentos"],
      ["Ourela", "", "Fios auxiliares de desenrolamento do sistema"],
      ["Ourela", "", "Tensão do fio"],
      ["Ourela", "", "Condições e função do detector de urdidura"],
      ["Ourela", "", "Funcionamento do enrolamento"],
      ["Ourela", "", "Posição das guias de cerâmica"],
      ["Tempereiros", "", "Condições gerais dos rolos da agulha"],
      ["Tempereiros", "", "Lubrificar o eixo do tempereiro com uma gota de óleo"],
      ["Tempereiros", "", "Se o tempereiro está paralelo com o perfil do tempereiro"],
      ["Suporte do tecido", "", "Fixações"],
      ["Rolo da lixa", "", "Condições da cobertura de borracha"],
      ["Rolo da lixa", "", "Condições no caso de metalização"],
      ["Rolo da lixa", "", "Folga nos rolamentos do cilindro de lixa"],
      ["Rolo da lixa", "", "Condições da pressão dos rolos de pressão"],
      ["Rolo da lixa", "", "Condições da cobertura dos rolos de pressão"],
      ["Rolo da lixa", "", "Verificar as buchas dos rolos de pressão"],
      ["Rolo de tecido", "", "Acionador do rolo de tecido"],
      ["Rolo de tecido", "", "Se o acoplamento deslizante funciona de maneira suficiente"],
      ["Rolo de tecido", "", "Conexões de engate"],
      ["Batente", "", "Rolamentos do eixo do batente"],
      ["Batente", "", "Se todos os pesos estão posicionados corretamente"],
      ["Formação da cala", "", "Tamanho da cala"],
      ["Formação da cala", "", "Posição da cala"],
      ["Formação da cala", "", "Nível dos quadros do liço"],
      ["Formação da cala", "", "Cruzamento dos quadros de liço (carretel e terminal da máquina) — verificar 2 passagens"],
      ["Quadro do liço", "", "Condições gerais dos quadros do liço"],
      ["Quadro do liço", "", "Topo e fundo da guia do liço"],
      ["Quadro do liço", "", "Acoplamento dos quadros do liço"],
      ["Quadro do liço", "", "Lubrificação das hastes de conexão"],
      ["Detector da urdidura", "", "Condições do detector de urdidura e lamelas"],
      ["Detector da urdidura", "", "Parâmetros do detector de urdidura"],
      ["Detector da urdidura", "", "Altura e posição horizontal do detector"],
      ["Detector da urdidura", "", "Funcionamento dos eletrodos por meio de uma lamela"],
      ["Desenrolamento", "", "Condições e parâmetros do acoplamento do rolo de urdume"],
      ["Desenrolamento", "", "Sistema de travamento do rolo de urdume"],
      ["Desenrolamento", "", "Condições das guias: rolos, parafusos"],
      ["Porta-fios", "", "Parâmetros do movimento do porta-fios"],
      ["Porta-fios", "", "Comparar parâmetros do terminal da máquina com os mecânicos (calibragem)"],
      ["Porta-fios", "", "Ajuste do movimento de relaxamento"],
      ["Porta-fios", "", "Lona do freio"],
      ["Porta-fios", "", "Folga nos rolamentos dos tubos do rolo"],
      ["Porta-fios", "", "Tensão das molas e posição do rolo sensor"],
      ["Porta-fios", "", "Condições do sensor TSF"],
      ["Porta-fios", "", "Amplitude (vibrações) do rolo sensor"],
      ["Porta-fios", "", "Tensão do urdume"],
      ["Porta-fios", "", "Ajustar o movimento de relaxamento nos lados esquerdo e direito"],
      ["Movimento lento do buscador de passagens", "", "Funcionamento do PX"],
      ["Motor SUMO", "", "Se o eixo para girar o SUMO está em boas condições"],
      ["Motor SUMO", "", "Temperatura do motor"]
    ],
    "omniplus_prev__anual": [
      ["Máquina", "", "Todos os aterramentos da máquina"],
      ["Motor SUMO", "", "Fixação da borracha no motor SUMO"],
      ["Motor SUMO", "", "Se a tampa está presa corretamente"],
      ["Bocais principais", "", "Posição e alinhamento dos bocais fixos com relação ao móvel"],
      ["Bocais principais", "", "Condições gerais"],
      ["Bocais principais", "", "Tensão da trama entre os bocais fixos e móveis"],
      ["Cortador da trama", "", "Altura e posição lateral do cortador"],
      ["Cortador da trama", "", "Corte em diferentes locais da lâmina (modo de teste)"],
      ["Cortador da trama", "", "Momento do corte"],
      ["Cortador da trama", "", "Condições gerais e posição da braçadeira da trama"],
      ["Bocal de estiramento", "", "Condições e parâmetros"],
      ["Bocal de estiramento", "", "Funcionamento e válvula de extração"],
      ["Bocal de estiramento", "", "Condições dos tubos de ar, danos"],
      ["Bocal de estiramento", "", "Conexões dos tubos de ar"],
      ["Detector da trama", "", "Condições dos fios elétricos"],
      ["Detector da trama", "", "Conexões dos fios elétricos"],
      ["Detector da trama", "", "Sujeira — remover felpas"],
      ["Filtro de ar", "", "Sujeira — medir a pressão em ambos os pontos de conexão"],
      ["Filtro de ar", "", "Filtro para água"],
      ["Elsy", "", "Definição da altura"],
      ["Elsy", "", "Definição da profundidade"],
      ["Elsy", "", "Condições gerais"],
      ["Elsy", "", "Acúmulo de poeira nos dispositivos"],
      ["Placas de proteção", "", "Condições das placas de proteção"],
      ["Controle elétrico", "", "Se a caixa de controle está na posição exata"],
      ["Controle elétrico", "", "Condições gerais da caixa de controle"],
      ["Controle elétrico", "", "Sem contato da caixa de controle com peças do tear (vibrações)"],
      ["Controle elétrico", "", "Limpar o ventilador de refrigeração da caixa de controle"],
      ["Controle elétrico", "", "Funcionamento de todas as lâmpadas indicadoras (KBD: -P425-)"],
      ["Controle elétrico", "", "Fiação — atenção especial aos locais com vibração"],
      ["Controle elétrico", "", "Função do freio de estacionamento"],
      ["Acoplamento elástico", "", "Condições do acoplamento elástico"],
      ["Posição da máquina", "", "Alinhamento da máquina"],
      ["Posição da máquina", "", "Nivelamento da máquina"],
      ["Posição da máquina", "", "Se a máquina está corretamente presa ao piso"],
      ["Posição da máquina", "", "Se as placas de espessura estão corretamente posicionadas"],
      ["Posição da máquina", "", "Cada pé com relação a vibrações"],
      ["Posição da máquina", "", "Parafusos de cada pé corretamente apertados"],
      ["Posição da máquina", "", "Condições da máquina posicionada nas bolsas de ar"],
      ["Rolo de urdidura", "", "Adaptadores"],
      ["Rolo de urdidura", "", "Condições das conexões"],
      ["Rolo de urdidura", "", "Engrenagem do rolo de urdidura"],
      ["Freio de estacionamento", "", "Funcionamento"],
      ["Freio de estacionamento", "", "Desgaste das pastilhas do freio"],
      ["Freio de estacionamento", "", "Folga entre o disco do freio e o freio fixo"],
      ["Freio de estacionamento", "", "Condições da polia do freio"],
      ["Troca de filtro", "Trocar", "Filtro de finos"],
      ["Maquineta", "Trocar", "Substituição da caixa dos filtros"]
    ]
  };
  var MACHINE_ROWS = [
      { id: 'eq-83', machine_code: '83', machine_name: 'Tear 83', manufacturer: 'Picanol', model: 'Gammax 8R', serial_number: '275103', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-86', machine_code: '86', machine_name: 'Tear 86', manufacturer: 'Picanol', model: 'Gammax 8R', serial_number: '274650', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-115', machine_code: '115', machine_name: 'Tear 115', manufacturer: 'Picanol', model: 'Optimax', serial_number: '304980', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-116', machine_code: '116', machine_name: 'Tear 116', manufacturer: 'Picanol', model: 'Optimax', serial_number: '304979', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-117', machine_code: '117', machine_name: 'Tear 117', manufacturer: 'Picanol', model: 'Optimax', serial_number: '304977', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-118', machine_code: '118', machine_name: 'Tear 118', manufacturer: 'Picanol', model: 'Optimax', serial_number: '304976', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-119', machine_code: '119', machine_name: 'Tear 119', manufacturer: 'Picanol', model: 'Optimax', serial_number: '304981', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-120', machine_code: '120', machine_name: 'Tear 120', manufacturer: 'Picanol', model: 'Optimax', serial_number: '304978', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-121', machine_code: '121', machine_name: 'Tear 121', manufacturer: 'Picanol', model: 'Optimax', serial_number: '307507', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-122', machine_code: '122', machine_name: 'Tear 122', manufacturer: 'Picanol', model: 'Optimax', serial_number: '307508', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-123', machine_code: '123', machine_name: 'Tear 123', manufacturer: 'Picanol', model: 'Optimax', serial_number: '307512', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-124', machine_code: '124', machine_name: 'Tear 124', manufacturer: 'Picanol', model: 'Optimax', serial_number: '307511', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-125', machine_code: '125', machine_name: 'Tear 125', manufacturer: 'Picanol', model: 'Optimax', serial_number: '307510', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-126', machine_code: '126', machine_name: 'Tear 126', manufacturer: 'Picanol', model: 'Optimax', serial_number: '307509', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-127', machine_code: '127', machine_name: 'Tear 127', manufacturer: 'Picanol', model: 'Optimax', serial_number: '318576', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-128', machine_code: '128', machine_name: 'Tear 128', manufacturer: 'Picanol', model: 'Optimax', serial_number: '318761', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-129', machine_code: '129', machine_name: 'Tear 129', manufacturer: 'Picanol', model: 'Optimax', serial_number: '320099', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-130', machine_code: '130', machine_name: 'Tear 130', manufacturer: 'Picanol', model: 'Optimax', serial_number: '320098', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-131', machine_code: '131', machine_name: 'Tear 131', manufacturer: 'Picanol', model: 'Optimax', serial_number: '327432', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-132', machine_code: '132', machine_name: 'Tear 132', manufacturer: 'Picanol', model: 'Optimax', serial_number: '327433', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-133', machine_code: '133', machine_name: 'Tear 133', manufacturer: 'Picanol', model: 'Optimax', serial_number: '327484', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-134', machine_code: '134', machine_name: 'Tear 134', manufacturer: 'Picanol', model: 'Optimax', serial_number: '327483', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-135', machine_code: '135', machine_name: 'Tear 135', manufacturer: 'Picanol', model: 'Optimax', serial_number: '403584', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-136', machine_code: '136', machine_name: 'Tear 136', manufacturer: 'Picanol', model: 'Optimax', serial_number: '403583', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-137', machine_code: '137', machine_name: 'Tear 137', manufacturer: 'Picanol', model: 'Optimax', serial_number: '408643', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-138', machine_code: '138', machine_name: 'Tear 138', manufacturer: 'Picanol', model: 'Optimax', serial_number: '408642', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-139', machine_code: '139', machine_name: 'Tear 139', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '288387', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-140', machine_code: '140', machine_name: 'Tear 140', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '288349', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-141', machine_code: '141', machine_name: 'Tear 141', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '288348', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-142', machine_code: '142', machine_name: 'Tear 142', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '288386', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-143', machine_code: '143', machine_name: 'Tear 143', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '281175', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-144', machine_code: '144', machine_name: 'Tear 144', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '281178', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-145', machine_code: '145', machine_name: 'Tear 145', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '281177', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-146', machine_code: '146', machine_name: 'Tear 146', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '281176', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-149', machine_code: '149', machine_name: 'Tear 149', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '233515', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-150', machine_code: '150', machine_name: 'Tear 150', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '234981', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-151', machine_code: '151', machine_name: 'Tear 151', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '235739', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-152', machine_code: '152', machine_name: 'Tear 152', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '234961', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-155', machine_code: '155', machine_name: 'Tear 155', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '234864', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-156', machine_code: '156', machine_name: 'Tear 156', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '232714', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-157', machine_code: '157', machine_name: 'Tear 157', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '234865', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-158', machine_code: '158', machine_name: 'Tear 158', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '234468', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-165', machine_code: '165', machine_name: 'Tear 165', manufacturer: 'Picanol', model: 'OmniPlus', serial_number: '437082', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-166', machine_code: '166', machine_name: 'Tear 166', manufacturer: 'Picanol', model: 'Omni I Connect 3,40', serial_number: '437083', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-167', machine_code: '167', machine_name: 'Tear 167', manufacturer: 'Picanol', model: 'Omni I Connect 3,40', serial_number: '437084', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-168', machine_code: '168', machine_name: 'Tear 168', manufacturer: 'Picanol', model: 'Omni I Connect 3,40', serial_number: '437081', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-175', machine_code: '175', machine_name: 'Tear 175', manufacturer: 'Picanol', model: 'Gamma-6-J-2,20-JC', serial_number: '238115', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-176', machine_code: '176', machine_name: 'Tear 176', manufacturer: 'Picanol', model: 'Gamma-6-J-2,20-JC', serial_number: '238094', sector: 'Tecelagem', active: true, status: 'operational' },
      { id: 'eq-comp-01', machine_code: 'Comp 01', machine_name: 'Compressor 01', manufacturer: 'Kaeser', model: 'CSD 100', serial_number: '123432', sector: 'Compressor', active: true, status: 'operational' },
      { id: 'eq-comp-02', machine_code: 'Comp 02', machine_name: 'Compressor 02', manufacturer: 'Kaeser', model: 'CSD 100', serial_number: '123431', sector: 'Compressor', active: true, status: 'operational' },
      { id: 'eq-comp-03', machine_code: 'Comp 03', machine_name: 'Compressor 03', manufacturer: 'Kaeser', model: 'CSD 200', serial_number: '123433', sector: 'Compressor', active: true, status: 'operational' },
      { id: 'eq-comp-04', machine_code: 'Comp 04', machine_name: 'Compressor 04', manufacturer: 'Kaeser', model: 'CSD 200', serial_number: '123434', sector: 'Compressor', active: true, status: 'operational' }
  ];
  var routinePlanForModel = function(model) {
    var text = String(model || '').toLowerCase();
    if (text.indexOf('optimax') >= 0 || text.indexOf('gamma') >= 0) return 'optimax';
    if (text.indexOf('omni') >= 0) return 'omniplus';
    return null;
  };
  var buildRoutineTasks = function(machineRows) {
    var tasks = [];
    ROUTINES.forEach(function(routine, routineIndex) {
      var plan = routine[0].split('_')[0];
      var group = machineRows.filter(function(machine) { return routinePlanForModel(machine.model) === plan; });
      group.forEach(function(machine, index) {
        var days = routine[4];
        var position = (index + routineIndex * 5) % group.length;
        var offset = days ? 1 + Math.floor(position * days / group.length) : null;
        tasks.push({
          id: 'rt-' + String(machine.id).replace(/^eq-/, '') + '-' + routine[0],
          machine_id: machine.id, routine_id: routine[0], task_kind: routine[2],
          service_description: routine[1] + ' · ' + routine[3], periodicity: routine[3],
          interval_days: days, next_due_at: days ? '@day(' + offset + ')' : null,
          status: days ? 'pending' : 'on_demand'
        });
      });
    });
    return tasks;
  };
  var SAMPLE_ROWS = {
    machines: MACHINE_ROWS,
    maintenance_tasks: buildRoutineTasks(MACHINE_ROWS)
  };
  // @end:sample-data

  // @section:shared-ui @depends:[theme,styles]
  var notify = function(message) {
    if (Platform.OS === 'web') window.alert(message);
    else Alert.alert('Manutenção da Fábrica', message);
  };
  var statusName = function(value) {
    return ({
      operational: 'Operacional', maintenance: 'Em manutenção', stopped: 'Parada',
      pending: 'Pendente', overdue: 'Atrasada', in_progress: 'Em andamento',
      completed: 'Concluído', open: 'Aberto', in_repair: 'Em conserto',
      received: 'Recebido', awaiting_installation: 'Aguardando instalação', on_demand: 'Sob demanda'
    })[value] || value || 'Não informado';
  };
  var statusColor = function(value) {
    return value === 'completed' || value === 'operational' ? GREEN :
      value === 'overdue' || value === 'stopped' || value === 'open' ? RED : value === 'on_demand' ? PRIMARY : '#956014';
  };
  var machineLabel = function(machines, id) {
    var machine = machines.find(function(item) { return item && item.id === id; });
    return machine ? (machine.machine_name || machine.machine_code || 'Máquina') : 'Máquina não disponível';
  };
  var formatDate = function(value) {
    if (!value) return 'Não informada';
    var datePart = String(value).slice(0, 10);
    var match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return match[3] + '/' + match[2] + '/' + match[1];
    var brazilianMatch = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brazilianMatch) return brazilianMatch[0];
    return String(value);
  };
  var Header = function(props) {
    var insets = useSafeAreaInsets();
    return React.createElement(View, { style: [styles.header, { paddingTop: insets.top + 16 }], componentId: 'header-' + props.title },
      React.createElement(Text, { style: styles.headerEyebrow, componentId: 'header-eyebrow-' + props.title }, 'MANUTENÇÃO DA FÁBRICA'),
      React.createElement(Text, { style: styles.headerTitle, componentId: 'header-title-' + props.title }, props.title),
      props.subtitle ? React.createElement(Text, { style: styles.headerSubtitle, componentId: 'header-subtitle-' + props.title }, props.subtitle) : null
    );
  };
  var Badge = function(props) {
    var color = statusColor(props.value);
    return React.createElement(View, { style: [styles.badge, { borderColor: color }], componentId: 'badge-' + props.id },
      React.createElement(Text, { style: [styles.badgeText, { color: color }], componentId: 'badge-text-' + props.id }, statusName(props.value))
    );
  };
  var ActionButton = function(props) {
    return React.createElement(TouchableOpacity, {
      onPress: props.onPress, disabled: props.disabled,
      style: [styles.button, props.secondary && styles.buttonSecondary, props.disabled && styles.buttonDisabled],
      componentId: props.componentId
    },
      props.icon ? React.createElement(Ionicons, { name: props.icon, size: 20, color: props.secondary ? PRIMARY : TEXT }) : null,
      React.createElement(Text, { style: [styles.buttonText, props.secondary && styles.buttonSecondaryText], componentId: props.componentId + '-label' }, props.label)
    );
  };
  var DataCard = function(props) {
    return React.createElement(TouchableOpacity, {
      onPress: props.onPress, disabled: !props.onPress, activeOpacity: 0.8,
      style: styles.card, componentId: 'card-' + props.id
    },
      React.createElement(View, { style: [styles.stateStripe, { backgroundColor: statusColor(props.status) }], componentId: 'stripe-' + props.id }),
      React.createElement(View, { style: styles.cardContent, componentId: 'card-content-' + props.id },
        React.createElement(View, { style: styles.cardTop, componentId: 'card-top-' + props.id },
          React.createElement(Text, { style: styles.code, componentId: 'code-' + props.id }, props.code || 'REGISTRO'),
          React.createElement(Badge, { value: props.status, id: props.id })
        ),
        React.createElement(Text, { style: styles.cardTitle, componentId: 'card-title-' + props.id }, props.title || 'Sem descrição'),
        React.createElement(Text, { style: styles.meta, componentId: 'card-meta-' + props.id }, props.detail || 'Toque para consultar')
      )
    );
  };
  var EmptyLine = function(props) {
    return React.createElement(View, { style: styles.empty, componentId: 'empty-' + props.id },
      React.createElement(Ionicons, { name: 'clipboard-outline', size: 28, color: SECONDARY }),
      React.createElement(Text, { style: styles.body, componentId: 'empty-text-' + props.id }, props.text)
    );
  };
  var Notice = function(props) {
    return React.createElement(View, { style: styles.notice, componentId: 'notice-' + props.id },
      React.createElement(Ionicons, { name: 'information-circle-outline', size: 22, color: PRIMARY }),
      React.createElement(Text, { style: styles.noticeText, componentId: 'notice-text-' + props.id }, props.text)
    );
  };
  // @end:shared-ui

  // @section:DateField @depends:[imports,styles]
  var getDateParts = function(value) {
    var text = value == null ? '' : String(value);
    var isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return { year: Number(isoMatch[1]), month: Number(isoMatch[2]) - 1, day: Number(isoMatch[3]) };
    var brazilianMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brazilianMatch) return { year: Number(brazilianMatch[3]), month: Number(brazilianMatch[2]) - 1, day: Number(brazilianMatch[1]) };
    var current = new Date();
    return { year: current.getFullYear(), month: current.getMonth(), day: current.getDate() };
  };
  var dateToISO = function(year, month, day) {
    var monthText = String(month + 1).padStart(2, '0');
    var dayText = String(day).padStart(2, '0');
    return String(year) + '-' + monthText + '-' + dayText;
  };
  var DateField = function(props) {
    var visibleState = React.useState(false);
    var visible = visibleState[0];
    var setVisible = visibleState[1];
    var initialParts = getDateParts(props.value);
    var yearState = React.useState(initialParts.year);
    var year = yearState[0];
    var setYear = yearState[1];
    var monthState = React.useState(initialParts.month);
    var month = monthState[0];
    var setMonth = monthState[1];
    var monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    React.useEffect(function() {
      if (visible) {
        var parts = getDateParts(props.value);
        setYear(parts.year);
        setMonth(parts.month);
      }
    }, [visible, props.value]);
    var firstWeekday = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var selectedParts = props.value ? getDateParts(props.value) : null;
    var calendarCells = [];
    for (var blankIndex = 0; blankIndex < firstWeekday; blankIndex += 1) calendarCells.push(null);
    for (var dayIndex = 1; dayIndex <= daysInMonth; dayIndex += 1) calendarCells.push(dayIndex);
    var changeMonth = function(offset) {
      var next = new Date(year, month + offset, 1);
      setYear(next.getFullYear());
      setMonth(next.getMonth());
    };
    return React.createElement(View, { style: styles.dateField, componentId: 'date-field-' + props.fieldKey },
      React.createElement(TouchableOpacity, {
        style: styles.dateInput,
        onPress: function() { setVisible(true); },
        activeOpacity: 0.75,
        componentId: 'date-input-' + props.fieldKey
      },
        React.createElement(Text, { style: [styles.dateValue, !props.value && styles.datePlaceholder], componentId: 'date-value-' + props.fieldKey }, props.value ? formatDate(props.value) : 'DD/MM/AAAA'),
        React.createElement(Ionicons, { name: 'calendar-outline', size: 22, color: PRIMARY, componentId: 'date-calendar-icon-' + props.fieldKey })
      ),
      React.createElement(Modal, { visible: visible, transparent: true, animationType: 'fade', onRequestClose: function() { setVisible(false); } },
        React.createElement(View, { style: styles.calendarOverlay, componentId: 'calendar-overlay-' + props.fieldKey },
          React.createElement(View, { style: styles.calendarCard, componentId: 'calendar-card-' + props.fieldKey },
            React.createElement(View, { style: styles.calendarHeading, componentId: 'calendar-heading-' + props.fieldKey },
              React.createElement(TouchableOpacity, { style: styles.calendarNav, onPress: function() { changeMonth(-1); }, componentId: 'calendar-previous-' + props.fieldKey },
                React.createElement(Ionicons, { name: 'chevron-back', size: 22, color: PRIMARY, componentId: 'calendar-previous-icon-' + props.fieldKey })
              ),
              React.createElement(Text, { style: styles.calendarMonth, componentId: 'calendar-month-' + props.fieldKey }, monthNames[month] + ' ' + year),
              React.createElement(TouchableOpacity, { style: styles.calendarNav, onPress: function() { changeMonth(1); }, componentId: 'calendar-next-' + props.fieldKey },
                React.createElement(Ionicons, { name: 'chevron-forward', size: 22, color: PRIMARY, componentId: 'calendar-next-icon-' + props.fieldKey })
              )
            ),
            React.createElement(View, { style: styles.calendarGrid, componentId: 'calendar-weekdays-' + props.fieldKey },
              ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function(label, index) {
                return React.createElement(View, { key: 'weekday-' + index, style: styles.calendarWeekdayCell, componentId: 'calendar-weekday-' + props.fieldKey + '-' + index },
                  React.createElement(Text, { style: styles.calendarWeekday, componentId: 'calendar-weekday-label-' + props.fieldKey + '-' + index }, label)
                );
              })
            ),
            React.createElement(View, { style: styles.calendarGrid, componentId: 'calendar-days-' + props.fieldKey },
              calendarCells.map(function(day, index) {
                if (day == null) return React.createElement(View, { key: 'blank-' + index, style: styles.calendarDayCell, componentId: 'calendar-blank-' + props.fieldKey + '-' + index });
                var isSelected = !!selectedParts && selectedParts.year === year && selectedParts.month === month && selectedParts.day === day;
                return React.createElement(TouchableOpacity, {
                  key: 'day-' + day,
                  style: [styles.calendarDayCell, isSelected && styles.calendarDaySelected],
                  onPress: function() {
                    props.onChange(dateToISO(year, month, day));
                    setVisible(false);
                  },
                  componentId: 'calendar-day-' + props.fieldKey + '-' + day
                },
                  React.createElement(Text, { style: [styles.calendarDayText, isSelected && styles.calendarDayTextSelected], componentId: 'calendar-day-label-' + props.fieldKey + '-' + day }, String(day))
                );
              })
            ),
            React.createElement(TouchableOpacity, { style: styles.calendarCancel, onPress: function() { setVisible(false); }, componentId: 'calendar-cancel-' + props.fieldKey },
              React.createElement(Text, { style: styles.calendarCancelText, componentId: 'calendar-cancel-label-' + props.fieldKey }, 'Cancelar')
            )
          )
        )
      )
    );
  };
  // @end:DateField

  // @section:FormSheet @depends:[shared-ui,DateField,styles]
  var FormSheet = function(props) {
    var insets = useSafeAreaInsets();
    var windowHeight = useWindowDimensions().height;
    var baseHeight = (Platform.OS === 'web' && typeof window !== 'undefined' && window.__thunkablePhoneFrameHeight) || windowHeight;
    var sheetHeight = Math.round(baseHeight * 0.88);
    var formState = React.useState({});
    var form = formState[0];
    var setForm = formState[1];
    var pickerState = React.useState({});
    var pickerSearch = pickerState[0];
    var setPickerSearch = pickerState[1];
    React.useEffect(function() { if (props.visible) { setForm(props.initial || {}); setPickerSearch({}); } }, [props.visible, props.initial?.id]);
    var change = function(key, value) { setForm(function(old) { return Object.assign({}, old, { [key]: value }); }); };
    var fields = props.fields || [];
    var renderOptions = function(field, options, value) {
      return React.createElement(View, { style: styles.optionWrap, componentId: 'options-' + field.key },
        options.map(function(option, optionIndex) {
          var selected = value === option.value;
          return React.createElement(TouchableOpacity, {
            key: String(option.value), onPress: function() { change(field.key, option.value); },
            style: [styles.option, selected && styles.optionSelected],
            componentId: 'option-' + field.key + '-' + optionIndex
          }, React.createElement(Text, { style: [styles.optionText, selected && styles.optionTextSelected], componentId: 'option-label-' + field.key + '-' + optionIndex }, option.label));
        })
      );
    };
    var renderPicker = function(field, value) {
      var text = String(pickerSearch[field.key] || '').trim().toLowerCase();
      var selectedOption = field.options.find(function(option) { return option.value === value; });
      var found = text ? field.options.filter(function(option) { return String(option.label).toLowerCase().indexOf(text) >= 0; }).slice(0, 12) : [];
      if (selectedOption && found.indexOf(selectedOption) < 0) found = [selectedOption].concat(found);
      return React.createElement(View, { componentId: 'picker-' + field.key },
        React.createElement(TextInput, {
          value: pickerSearch[field.key] || '',
          onChangeText: function(next) { setPickerSearch(function(old) { return Object.assign({}, old, { [field.key]: next }); }); },
          placeholder: 'Digite o número da máquina',
          placeholderTextColor: SECONDARY,
          style: [styles.input, { marginBottom: 8 }],
          autoCorrect: false,
          componentId: 'picker-search-' + field.key
        }),
        found.length ? renderOptions(field, found, value) : React.createElement(Text, { style: styles.meta, componentId: 'picker-hint-' + field.key }, text ? 'Nenhuma máquina encontrada.' : 'Nenhuma máquina selecionada.')
      );
    };
    var renderChecklist = function(field, value) {
      var list = Array.isArray(value) ? value : [];
      var allIds = field.checklist.map(function(item) { return item.id; });
      var allDone = allIds.length > 0 && allIds.every(function(id) { return list.indexOf(id) >= 0; });
      return React.createElement(View, { componentId: 'checklist-' + field.key },
        React.createElement(View, { style: styles.checkHeader, componentId: 'checklist-header-' + field.key },
          React.createElement(Text, { style: styles.checkCount, componentId: 'checklist-count-' + field.key }, list.filter(function(id) { return allIds.indexOf(id) >= 0; }).length + ' de ' + allIds.length + ' itens conferidos'),
          React.createElement(TouchableOpacity, { onPress: function() { change(field.key, allDone ? [] : allIds); }, style: styles.checkAll, componentId: 'checklist-all-' + field.key },
            React.createElement(Text, { style: styles.checkAllText, componentId: 'checklist-all-label-' + field.key }, allDone ? 'Desmarcar todos' : 'Marcar todos')
          )
        ),
        field.checklist.map(function(item, itemIndex) {
          var done = list.indexOf(item.id) >= 0;
          return React.createElement(TouchableOpacity, {
            key: item.id,
            onPress: function() { change(field.key, done ? list.filter(function(id) { return id !== item.id; }) : list.concat([item.id])); },
            style: [styles.checkItem, done && styles.checkItemDone],
            componentId: 'check-' + field.key + '-' + itemIndex
          },
            React.createElement(Ionicons, { name: done ? 'checkbox' : 'square-outline', size: 26, color: done ? GREEN : SECONDARY }),
            React.createElement(View, { style: { flex: 1 }, componentId: 'check-body-' + field.key + '-' + itemIndex },
              React.createElement(Text, { style: styles.checkTitle, componentId: 'check-title-' + field.key + '-' + itemIndex }, (itemIndex + 1) + '. ' + item.title),
              item.detail ? React.createElement(Text, { style: styles.checkDetail, componentId: 'check-detail-' + field.key + '-' + itemIndex }, item.detail) : null
            )
          );
        })
      );
    };
    return React.createElement(Modal, { visible: !!props.visible, transparent: true, animationType: 'slide', onRequestClose: props.onClose },
      React.createElement(View, { style: [styles.overlay, { marginTop: insets.top }], componentId: 'form-overlay' },
        React.createElement(View, { style: [styles.sheet, { height: sheetHeight, paddingBottom: insets.bottom + 20 }], componentId: 'form-sheet' },
          React.createElement(View, { style: styles.sheetHeading, componentId: 'form-heading' },
            React.createElement(Text, { style: [styles.sectionTitle, { flex: 1 }], componentId: 'form-title' }, props.title || 'Registro'),
            React.createElement(TouchableOpacity, { style: styles.closeButton, onPress: props.onClose, componentId: 'form-close' },
              React.createElement(Ionicons, { name: 'close', size: 24, color: TEXT })
            )
          ),
          React.createElement(ScrollView, { style: { flex: 1 }, contentContainerStyle: { paddingTop: 16, paddingBottom: 24 }, keyboardShouldPersistTaps: 'handled', componentId: 'form-scroll' },
            props.extra ? React.createElement(Notice, { id: 'form-extra', text: props.extra }) : null,
            fields.map(function(field) {
              var value = form[field.key];
              return React.createElement(View, { key: field.key, style: styles.fieldGroup, componentId: 'field-' + field.key },
                React.createElement(Text, { style: styles.fieldLabel, componentId: 'label-' + field.key }, field.label),
                field.checklist ? renderChecklist(field, value) : field.date ? React.createElement(DateField, {
                  fieldKey: field.key,
                  value: value,
                  onChange: function(date) { change(field.key, date); }
                }) : field.time ? React.createElement(TextInput, {
                  value: value == null ? '' : String(value),
                  onChangeText: function(text) {
                    var digits = text.replace(/[^0-9]/g, '').slice(0, 4);
                    change(field.key, digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2) : digits);
                  },
                  placeholder: 'HH:mm',
                  placeholderTextColor: SECONDARY,
                  style: styles.input,
                  keyboardType: 'numeric',
                  maxLength: 5,
                  componentId: 'input-' + field.key
                }) : field.options && field.searchable ? renderPicker(field, value) : field.options ? renderOptions(field, field.options, value) : React.createElement(TextInput, {
                  value: value == null ? '' : String(value),
                  onChangeText: function(text) {
                    if (field.numeric) {
                      var clean = text.replace(/[^0-9.]/g, '');
                      var parts = clean.split('.');
                      change(field.key, parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : clean);
                    } else change(field.key, text);
                  },
                  placeholder: field.label,
                  placeholderTextColor: SECONDARY,
                  style: [styles.input, field.multiline && styles.multiline],
                  keyboardType: field.numeric ? 'decimal-pad' : 'default',
                  autoCapitalize: field.name ? 'words' : 'sentences',
                  autoCorrect: !field.numeric,
                  multiline: !!field.multiline,
                  numberOfLines: field.multiline ? 4 : 1,
                  textAlignVertical: field.multiline ? 'top' : 'center',
                  componentId: 'input-' + field.key
                })
              );
            })
          ),
          React.createElement(ActionButton, {
            label: 'Salvar registro', icon: 'checkmark-circle-outline',
            onPress: function() { props.onSave(form); },
            componentId: 'form-save'
          })
        )
      )
    );
  };
  // @end:FormSheet

  // @section:HomeScreen @depends:[shared-ui,styles]
  var HomeScreen = function(props) {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    var machines = useQuery('machines').data;
    var tasks = useQuery('maintenance_tasks').data;
    var calls = useQuery('corrective_calls').data;
    var components = useQuery('repair_components').data;
    var nowDate = new Date();
    var today = dateToISO(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    var dueToday = tasks.filter(function(t) { return t && t.next_due_at && String(t.next_due_at).slice(0, 10) === today && t.status !== 'completed'; });
    var overdue = tasks.filter(function(t) { return t && t.status !== 'completed' && (t.status === 'overdue' || (t.next_due_at && String(t.next_due_at).slice(0, 10) < today)); });
    var openCalls = calls.filter(function(c) { return c && c.status !== 'completed'; });
    var away = components.filter(function(c) { return c && c.status === 'in_repair'; });
    var metrics = [
      { title: 'Tarefas hoje', value: dueToday.length, icon: 'calendar-outline', target: 'Tarefas' },
      { title: 'Preventivas atrasadas', value: overdue.length, icon: 'time-outline', target: 'Tarefas' },
      { title: 'Chamados abertos', value: openCalls.length, icon: 'warning-outline', target: 'Chamados' },
      { title: 'Em conserto', value: away.length, icon: 'construct-outline', target: 'Componentes' }
    ];
    return React.createElement(View, { style: styles.screen, componentId: 'home-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Visão do dia', subtitle: 'Ordens, equipamentos e próximas ações' }),
      React.createElement(ScrollView, {
        style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' },
        contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: TAB_MENU_HEIGHT + insets.bottom + SCROLL_EXTRA_PADDING },
        componentId: 'home-scroll'
      },
        React.createElement(Text, { style: styles.sectionTitle, componentId: 'home-overview-title' }, 'Painel de manutenção'),
        React.createElement(View, { style: styles.metricGrid, componentId: 'home-metrics' },
          metrics.map(function(metric, index) {
            return React.createElement(TouchableOpacity, {
              key: metric.title, style: styles.metric,
              onPress: function() { props.navigation.navigate(metric.target); },
              componentId: 'metric-' + index
            },
              React.createElement(Ionicons, { name: metric.icon, size: 24, color: PRIMARY }),
              React.createElement(Text, { style: styles.metricNumber, componentId: 'metric-number-' + index }, String(metric.value)),
              React.createElement(Text, { style: styles.metricLabel, componentId: 'metric-label-' + index }, metric.title)
            );
          })
        ),
        React.createElement(Text, { style: styles.sectionTitle, componentId: 'home-pending-title' }, 'Na bancada agora'),
        overdue.length ? React.createElement(DataCard, {
          id: 'home-task', code: 'PREVENTIVA', status: 'overdue',
          title: overdue[0]?.service_description,
          detail: machineLabel(machines, overdue[0]?.machine_id) + ' · Prazo ' + formatDate(overdue[0]?.next_due_at),
          onPress: function() { props.navigation.navigate('Tarefas'); }
        }) : React.createElement(EmptyLine, { id: 'home-overdue', text: 'Nenhuma preventiva atrasada.' }),
        away.length ? React.createElement(DataCard, {
          id: 'home-component', code: away[0]?.component_code, status: away[0]?.status,
          title: away[0]?.component_model, detail: (away[0]?.repair_vendor || 'Fornecedor não informado') + ' · ' + machineLabel(machines, away[0]?.origin_machine_id),
          onPress: function() { props.navigation.navigate('Componentes'); }
        }) : React.createElement(EmptyLine, { id: 'home-repair', text: 'Nenhum componente em conserto.' }),
        React.createElement(View, { style: styles.sectionGap, componentId: 'home-shortcuts' },
          React.createElement(ActionButton, { label: 'Relatórios básicos', icon: 'bar-chart-outline', secondary: true, onPress: function() { props.navigation.navigate('Relatórios'); }, componentId: 'home-reports' }),
          React.createElement(ActionButton, { label: 'Minha conta', icon: 'person-circle-outline', secondary: true, onPress: function() { props.navigation.navigate('Acesso'); }, componentId: 'home-access' })
        ),
        React.createElement(Notice, { id: 'home-demo', text: 'Os registros ficam no banco central da manutenção e aparecem em todos os celulares da equipe.' })
      )
    );
  };
  // @end:HomeScreen

  // @section:MachinesScreen @depends:[shared-ui,FormSheet,styles]
  var taskKindLabel = function(row) {
    if (row.task_kind === 'third_party') return 'TERCEIRIZADO';
    return row.task_kind === 'lubrication' ? 'LUBRIFICAÇÃO' : 'PREVENTIVA';
  };
  var MachinesScreen = function(props) {
    var insets = useSafeAreaInsets();
    var auth = useAuthInfo();
    var height = useWindowDimensions().height;
    var query = useQuery('machines');
    var taskUnitsState = useStorage('maintenance_task_units_v1', {});
    var taskUnits = taskUnitsState[0] || {};
    var taskQuery = useQuery('maintenance_tasks');
    var tasks = (taskQuery.data || []).map(function(task) {
      if (!task) return task;
      return Object.assign({}, task, {
        quantity_unit: task.quantity_unit || taskUnits[String(task.id)] || ''
      });
    });
    var calls = useQuery('corrective_calls').data;
    var components = useQuery('repair_components').data;
    var insert = useMutation('machines', 'insert').mutate;
    var update = useMutation('machines', 'update').mutate;
    var insertTask = useMutation('maintenance_tasks', 'insert').mutate;
    var camera = useCamera();
    var selectionState = React.useState(null);
    var selected = selectionState[0];
    var setSelected = selectionState[1];
    var editState = React.useState(null);
    var editing = editState[0];
    var setEditing = editState[1];
    var formState = React.useState(false);
    var formVisible = formState[0];
    var setFormVisible = formState[1];
    var serviceState = React.useState(false);
    var serviceVisible = serviceState[0];
    var setServiceVisible = serviceState[1];
    var executionState = React.useState(null);
    var execution = executionState[0];
    var setExecution = executionState[1];
    var searchState = React.useState('');
    var search = searchState[0];
    var setSearch = searchState[1];
    var routeParams = (props && props.route && props.route.params) || {};
    React.useEffect(function() {
      if (!routeParams.machineId) return;
      var found = query.data.find(function(item) { return item && item.id === routeParams.machineId; });
      if (found) setSelected(found);
    }, [routeParams.machineId, routeParams.openedAt, query.data.length]);
    var searchText = search.trim().toLowerCase();
    var visibleMachines = query.data.filter(function(item) {
      if (!item) return false;
      if (!searchText) return true;
      return [item.machine_code, item.machine_name, item.manufacturer, item.model, item.serial_number, item.sector].some(function(value) {
        return String(value || '').toLowerCase().indexOf(searchText) >= 0;
      });
    });
    var isCompressor = !!selected && (String(selected.sector || '').toLowerCase().indexOf('compressor') >= 0 || String(selected.manufacturer || '').toLowerCase() === 'kaeser');
    var related = selected ? tasks.filter(function(t) { return t && t.machine_id === selected.id && t.status === 'completed'; }).sort(function(a, b) { return String(b.completed_at || '').localeCompare(String(a.completed_at || '')); }).concat(calls.filter(function(c) { return c && c.machine_id === selected.id; }), components.filter(function(c) { return c && (c.origin_machine_id === selected.id || c.installed_machine_id === selected.id); })) : [];
    var nextRoutines = selected ? tasks.filter(function(t) { return t && t.machine_id === selected.id && t.status !== 'completed'; }).sort(function(a, b) {
      var da = a.next_due_at ? String(a.next_due_at).slice(0, 10) : '9999';
      var db = b.next_due_at ? String(b.next_due_at).slice(0, 10) : '9999';
      return da < db ? -1 : da > db ? 1 : 0;
    }) : [];
    var fields = [
      { key: 'machine_code', label: 'Código do equipamento (ID)' },
      { key: 'machine_name', label: 'Nome da máquina', name: true },
      { key: 'manufacturer', label: 'Fabricante', name: true },
      { key: 'model', label: 'Modelo' },
      { key: 'serial_number', label: 'Número de série' },
      { key: 'sector', label: 'Setor', name: true },
      { key: 'active', label: 'Ativo', options: [{ value: true, label: 'Sim' }, { value: false, label: 'Não' }] },
      { key: 'status', label: 'Situação', options: [{ value: 'operational', label: 'Operacional' }, { value: 'maintenance', label: 'Em manutenção' }, { value: 'stopped', label: 'Parada' }] }
    ];
    var serviceFields = [
      { key: 'service_date', label: 'Data do serviço', date: true },
      { key: 'vendor', label: 'Empresa terceirizada', name: true },
      { key: 'service_done', label: 'O que foi feito', multiline: true },
      { key: 'parts_replaced', label: 'Peças trocadas', multiline: true },
      { key: 'cost', label: 'Valor do serviço (R$)', numeric: true },
      { key: 'responsible_person', label: 'Mecânico que acompanhou', name: true },
      { key: 'observations', label: 'Observações', multiline: true }
    ];
    var save = function(form) {
      if (!String(form.machine_code || '').trim() || !String(form.machine_name || '').trim()) return notify('Informe código e nome da máquina.');
      var data = {
        machine_code: String(form.machine_code).trim(), machine_name: String(form.machine_name).trim(),
        manufacturer: String(form.manufacturer || '').trim(), model: String(form.model || '').trim(),
        serial_number: String(form.serial_number || '').trim(), sector: String(form.sector || '').trim(),
        active: form.active !== false, status: form.status || 'operational'
      };
      var operation = editing ? update({ id: editing.id, data: data }) : insert(data);
      operation.then(function() {
        query.refetch();
        setFormVisible(false);
        if (editing && selected && editing.id === selected.id) setSelected(Object.assign({}, selected, data));
        notify('Máquina salva.');
      }).catch(function(error) { notify(error.message || 'Não foi possível salvar.'); });
    };
    var saveService = function(form) {
      if (!form.service_date || !String(form.service_done || '').trim()) return notify('Informe a data e o que foi feito.');
      var vendor = String(form.vendor || '').trim();
      insertTask({
        machine_id: selected.id, task_kind: 'third_party',
        service_description: 'Serviço terceirizado' + (vendor ? ' · ' + vendor : ''),
        vendor: vendor || null, service_done: String(form.service_done).trim(),
        parts_replaced: String(form.parts_replaced || '').trim() || null,
        cost: form.cost ? Number(form.cost) : null,
        responsible_person: form.responsible_person || null, observations: form.observations || null,
        status: 'completed', completed_at: form.service_date + 'T12:00:00'
      }).then(function() {
        taskQuery.refetch();
        setServiceVisible(false);
        notify('Serviço registrado no histórico.');
      }).catch(function(error) { notify(error.message || 'Não foi possível salvar.'); });
    };
    var executionDateTime = function(value) {
      if (!value) return 'Não informado';
      var text = String(value);
      var match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      if (match) return match[3] + '/' + match[2] + '/' + match[1] + ' ' + match[4] + ':' + match[5];
      var dateMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
      if (dateMatch) return dateMatch[1] + '/' + dateMatch[2] + '/' + dateMatch[3] + (dateMatch[4] ? ' ' + dateMatch[4] + ':' + dateMatch[5] : '');
      return 'Não informado';
    };
    var machineDetail = function(item) {
      return [item.model, item.serial_number ? 'Nº ' + item.serial_number : '', item.sector].filter(Boolean).join(' · ') || 'Toque para ver a ficha';
    };
    var historyDetail = function(row) {
      if (row.task_kind === 'third_party') return [formatDate(row.completed_at), row.service_done, row.parts_replaced ? 'Peças: ' + row.parts_replaced : '', row.cost != null ? 'R$ ' + String(row.cost) : ''].filter(Boolean).join(' · ');
      if (row.service_description) return 'Concluída: ' + executionDateTime(row.completed_at) + (row.items_total ? ' · Itens: ' + (Array.isArray(row.checked_items) ? row.checked_items.length : 0) + ' de ' + row.items_total : '') + (row.responsible_person ? ' · ' + row.responsible_person : '');
      return row.responsible_person || 'Responsável não informado';
    };
    var line = function(id, label, value) {
      return value ? React.createElement(Text, { style: styles.body, componentId: 'execution-detail-' + id }, label + ': ' + value) : null;
    };
    return React.createElement(View, { style: styles.screen, componentId: 'machines-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Máquinas', subtitle: 'Ficha e histórico por equipamento' }),
      React.createElement(ScrollView, { style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' }, contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: TAB_MENU_HEIGHT + insets.bottom + SCROLL_EXTRA_PADDING }, keyboardShouldPersistTaps: 'handled', componentId: 'machines-scroll' },
        selected || !auth.isAdmin ? null : React.createElement(ActionButton, { label: 'Cadastrar máquina', icon: 'add-circle-outline', onPress: function() { setEditing(null); setFormVisible(true); }, componentId: 'machines-add' }),
        selected ? null : React.createElement(Text, { style: [styles.sectionTitle, styles.sectionGap], componentId: 'machines-list-title' }, 'Equipamentos (' + visibleMachines.length + ')'),
        selected ? null : React.createElement(TextInput, {
          value: search,
          onChangeText: setSearch,
          placeholder: 'Buscar por número, modelo ou série',
          placeholderTextColor: SECONDARY,
          style: [styles.input, { marginBottom: 12 }],
          autoCorrect: false,
          componentId: 'machines-search'
        }),
        selected ? null : visibleMachines.length ? visibleMachines.map(function(item, index) {
          return React.createElement(DataCard, { key: item.id || index, id: 'machine-' + index, code: item.machine_code, title: item.machine_name, detail: machineDetail(item), status: item.status, onPress: function() { setSelected(item); } });
        }) : React.createElement(EmptyLine, { id: 'machines', text: searchText ? 'Nenhuma máquina encontrada para essa busca.' : 'Nenhuma máquina cadastrada. Cadastre o primeiro equipamento.' }),
        selected ? React.createElement(ActionButton, { label: 'Voltar à lista', icon: 'arrow-back-outline', secondary: true, onPress: function() { setSelected(null); }, componentId: 'machine-back' }) : null,
        selected ? React.createElement(View, { style: [styles.detailPanel, { marginTop: 0 }], componentId: 'machine-detail' },
          React.createElement(Text, { style: styles.sectionTitle, componentId: 'machine-detail-title' }, selected.machine_name || 'Máquina'),
          React.createElement(Badge, { value: selected.status, id: 'selected-machine' }),
          React.createElement(Text, { style: styles.meta, componentId: 'machine-detail-code' }, 'Código: ' + (selected.machine_code || 'Não informado')),
          React.createElement(Text, { style: styles.meta, componentId: 'machine-detail-manufacturer' }, 'Fabricante: ' + (selected.manufacturer || 'Não informado')),
          React.createElement(Text, { style: styles.meta, componentId: 'machine-detail-model' }, 'Modelo: ' + (selected.model || 'Não informado')),
          React.createElement(Text, { style: styles.meta, componentId: 'machine-detail-serial' }, 'Número de série: ' + (selected.serial_number || 'Não informado')),
          React.createElement(Text, { style: styles.meta, componentId: 'machine-detail-sector' }, 'Setor: ' + (selected.sector || 'Não informado')),
          React.createElement(Text, { style: [styles.meta, { marginBottom: 12 }], componentId: 'machine-detail-active' }, 'Ativo: ' + (selected.active === false ? 'Não' : 'Sim')),
          isCompressor ? React.createElement(ActionButton, { label: 'Registrar serviço terceirizado', icon: 'construct-outline', onPress: function() { setServiceVisible(true); }, componentId: 'machine-third-party' }) : null,
          camera.photo?.uri ? React.createElement(Image, { source: { uri: camera.photo.uri }, style: styles.photo, resizeMode: 'cover', componentId: 'machine-captured-photo' }) : null,
          camera.error ? React.createElement(Text, { style: styles.error, componentId: 'machine-camera-error' }, camera.error) : null,
          React.createElement(ActionButton, { label: 'Tirar foto (demonstração)', icon: 'camera-outline', secondary: true, onPress: function() { camera.takePhoto().then(function(result) { if (result.error) notify(result.error); }); }, componentId: 'machine-camera' }),
          auth.isAdmin ? React.createElement(ActionButton, { label: 'Editar ficha', icon: 'create-outline', secondary: true, onPress: function() { setEditing(selected); setFormVisible(true); }, componentId: 'machine-edit' }) : null,
          isCompressor ? null : React.createElement(Text, { style: [styles.sectionTitle, styles.sectionGap], componentId: 'machine-schedule-title' }, 'Próximas rotinas (' + nextRoutines.length + ')'),
          isCompressor ? null : nextRoutines.length ? nextRoutines.slice(0, 5).map(function(row, index) {
            return React.createElement(DataCard, { key: row.id || index, id: 'next-' + index, code: taskKindLabel(row), title: row.service_description, detail: row.next_due_at ? 'Data: ' + formatDate(row.next_due_at) : 'Sem data programada', status: row.status });
          }) : React.createElement(EmptyLine, { id: 'machine-next', text: 'Nenhuma rotina programada para esta máquina.' }),
          !isCompressor && nextRoutines.length > 5 ? React.createElement(Text, { style: styles.meta, componentId: 'machine-next-more' }, 'Veja as demais na aba Tarefas, buscando por ' + (selected.machine_code || 'esta máquina') + '.') : null,
          React.createElement(Text, { style: [styles.sectionTitle, styles.sectionGap], componentId: 'machine-history-title' }, 'Histórico do equipamento'),
          related.length ? related.map(function(row, index) {
            var isTask = !!row.service_description;
            return React.createElement(DataCard, {
              key: row.id || index, id: 'history-' + index,
              code: row.component_code || (row.problem_description ? 'CHAMADO' : isTask ? taskKindLabel(row) : 'TAREFA'),
              title: row.service_description || row.problem_description || row.component_model || 'Atividade',
              detail: historyDetail(row),
              status: row.status,
              onPress: isTask ? function() { setExecution(row); } : undefined
            });
          }) : React.createElement(EmptyLine, { id: 'machine-history', text: 'Nenhuma atividade registrada nesta máquina.' })
        ) : null
      ),
      React.createElement(FormSheet, { visible: formVisible, title: editing ? 'Editar máquina' : 'Nova máquina', initial: editing, fields: fields, onClose: function() { setFormVisible(false); }, onSave: save }),
      React.createElement(FormSheet, { visible: serviceVisible, title: 'Serviço terceirizado', initial: selected ? { id: 'service-' + selected.id } : null, fields: serviceFields, onClose: function() { setServiceVisible(false); }, onSave: saveService, extra: selected ? (selected.machine_name || 'Máquina') + ' · registre o que a empresa terceirizada fez e trocou.' : null }),
      React.createElement(Modal, { visible: !!execution, transparent: true, animationType: 'fade', onRequestClose: function() { setExecution(null); } },
        React.createElement(View, { style: styles.calendarOverlay, componentId: 'execution-detail-overlay' },
          React.createElement(View, { style: styles.calendarCard, componentId: 'execution-detail-card' },
            React.createElement(ScrollView, { style: { maxHeight: 420 }, componentId: 'execution-detail-scroll' },
              React.createElement(Text, { style: styles.sectionTitle, componentId: 'execution-detail-title' }, execution ? execution.service_description || 'Execução da tarefa' : 'Execução da tarefa'),
              line('vendor', 'Empresa', execution && execution.vendor),
              line('service-done', 'O que foi feito', execution && execution.service_done),
              line('parts', 'Peças trocadas', execution && execution.parts_replaced),
              line('cost', 'Valor', execution && execution.cost != null ? 'R$ ' + String(execution.cost) : null),
              line('responsible', 'Responsável', execution && execution.responsible_person),
              line('start', 'Início', execution && execution.started_at ? executionDateTime(execution.started_at) : null),
              line('completion', 'Conclusão', execution && execution.completed_at ? executionDateTime(execution.completed_at) : null),
              line('items', 'Itens conferidos', execution && execution.items_total ? (Array.isArray(execution.checked_items) ? execution.checked_items.length : 0) + ' de ' + execution.items_total : null),
              line('product', 'Produto utilizado', execution && execution.product_used),
              line('quantity', 'Quantidade', execution && execution.quantity_used != null ? String(execution.quantity_used) + (execution.quantity_unit ? ' ' + execution.quantity_unit : '') : null),
              line('observations', 'Observações', execution && execution.observations)
            ),
            React.createElement(TouchableOpacity, { style: styles.calendarCancel, onPress: function() { setExecution(null); }, componentId: 'execution-detail-close' },
              React.createElement(Text, { style: styles.calendarCancelText, componentId: 'execution-detail-close-label' }, 'Fechar')
            )
          )
        )
      )
    );
  };
  // @end:MachinesScreen

  // @section:TasksScreen @depends:[shared-ui,FormSheet,DateField,styles,imports,sample-data]
  var PERIODICITY_OPTIONS = [
    { value: 'Semanal', label: 'Semanal (7 dias)', days: 7 },
    { value: 'Quinzenal', label: 'Quinzenal (15 dias)', days: 15 },
    { value: 'Mensal', label: 'Mensal (30 dias)', days: 30 },
    { value: 'Bimestral', label: 'Bimestral (60 dias)', days: 60 },
    { value: 'Trimestral', label: 'Trimestral (90 dias)', days: 90 },
    { value: 'Semestral', label: 'Semestral (180 dias)', days: 180 },
    { value: 'Anual', label: 'Anual (365 dias)', days: 365 },
    { value: 'Bianual', label: 'Bianual (730 dias)', days: 730 },
    { value: 'Trianual', label: 'Trianual (1095 dias)', days: 1095 },
    { value: EVENT_PERIODICITY, label: 'Toda troca de urdume', days: null }
  ];
  var periodicityDays = function(value) {
    var text = String(value || '').trim().toLowerCase();
    var option = PERIODICITY_OPTIONS.find(function(item) { return item.value.toLowerCase() === text; });
    if (option) return option.days;
    var number = parseInt(text, 10);
    return number > 0 ? number : null;
  };
  var addDays = function(isoDate, days) {
    var parts = getDateParts(isoDate);
    var next = new Date(parts.year, parts.month, parts.day + days);
    return dateToISO(next.getFullYear(), next.getMonth(), next.getDate());
  };
  var taskDate = function(task) { return task && task.next_due_at ? String(task.next_due_at).slice(0, 10) : ''; };
  var isEventTask = function(task) { return !!task && task.periodicity === EVENT_PERIODICITY; };
  var routineChecklist = function(task) {
    var items = task && task.routine_id ? (ROUTINE_ITEMS[task.routine_id] || []) : [];
    return items.map(function(item, index) {
      return { id: task.routine_id + '#' + (index + 1), title: item[0], detail: [item[1], item[2]].filter(Boolean).join(' · ') };
    });
  };
  var TasksScreen = function() {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    var query = useQuery('maintenance_tasks');
    var machines = useQuery('machines').data;
    var insert = useMutation('maintenance_tasks', 'insert').mutate;
    var update = useMutation('maintenance_tasks', 'update').mutate;
    var unitStorageState = useStorage('maintenance_task_units_v1', {});
    var storedUnits = unitStorageState[0] || {};
    var selectedState = React.useState(null);
    var selected = selectedState[0];
    var setSelected = selectedState[1];
    var visibleState = React.useState(false);
    var visible = visibleState[0];
    var setVisible = visibleState[1];
    var filterState = React.useState('todo');
    var filter = filterState[0];
    var setFilter = filterState[1];
    var searchState = React.useState('');
    var search = searchState[0];
    var setSearch = searchState[1];
    var now = new Date();
    var today = dateToISO(now.getFullYear(), now.getMonth(), now.getDate());
    var limitDate = addDays(today, 7);
    var machineById = {};
    machines.forEach(function(m) { if (m) machineById[m.id] = m; });
    var allTasks = query.data.filter(Boolean);
    var isOverdue = function(t) { return t.status !== 'completed' && !isEventTask(t) && !!taskDate(t) && taskDate(t) < today; };
    var groups = {
      todo: allTasks.filter(function(t) { return t.status !== 'completed' && !isEventTask(t) && (!taskDate(t) || taskDate(t) <= limitDate); }),
      event: allTasks.filter(function(t) { return t.status !== 'completed' && isEventTask(t); }),
      done: allTasks.filter(function(t) { return t.status === 'completed'; }),
      all: allTasks
    };
    var filters = [
      { key: 'todo', label: 'A fazer (7 dias)' },
      { key: 'done', label: 'Concluídas' },
      { key: 'all', label: 'Todas' }
    ];
    var searchText = search.trim().toLowerCase();
    var matches = function(t) {
      if (!searchText) return true;
      var m = machineById[t.machine_id] || {};
      return [m.machine_code, m.machine_name, m.model, t.service_description, t.responsible_person].some(function(v) { return String(v || '').toLowerCase().indexOf(searchText) >= 0; });
    };
    var byDate = function(a, b) {
      var da = taskDate(a) || '9999';
      var db = taskDate(b) || '9999';
      if (da !== db) return da < db ? -1 : 1;
      return machineOrder(machineById[a.machine_id], machineById[b.machine_id]);
    };
    var byCompletion = function(a, b) { return String(b.completed_at || '').localeCompare(String(a.completed_at || '')); };
    var list = groups[filter].filter(matches).slice().sort(filter === 'done' ? byCompletion : byDate);
    var LIMIT = 40;
    var shown = list.slice(0, LIMIT);
    var checklist = routineChecklist(selected);
    var isRoutine = !!(selected && selected.routine_id);
    var statusOptions = [{ value: 'pending', label: 'Pendente' }, { value: 'in_progress', label: 'Em andamento' }, { value: 'completed', label: 'Concluído' }];
    if (isEventTask(selected)) statusOptions = [{ value: 'on_demand', label: 'Sob demanda' }].concat(statusOptions);
    var statusField = { key: 'status', label: 'Situação', options: statusOptions };
    var executionFields = [
      { key: 'started_date', label: 'Data de início', date: true },
      { key: 'started_time', label: 'Hora de início', time: true }
    ].concat(checklist.length ? [{ key: 'checked_items', label: 'Checklist', checklist: checklist }] : [], [
      { key: 'completed_date', label: 'Data de conclusão', date: true },
      { key: 'completed_time', label: 'Hora de conclusão', time: true },
      { key: 'product_used', label: 'Produto utilizado' },
      { key: 'quantity_used', label: 'Quantidade utilizada', numeric: true },
      { key: 'quantity_unit', label: 'Unidade de medida', options: [{ value: 'g', label: 'g' }, { value: 'kg', label: 'kg' }, { value: 'mL', label: 'mL' }, { value: 'L', label: 'L' }, { value: 'un', label: 'un' }] },
      { key: 'responsible_person', label: 'Responsável', name: true },
      { key: 'observations', label: 'Observações', multiline: true }
    ]);
    var fields = isRoutine ? [statusField].concat(isEventTask(selected) ? [] : [{ key: 'next_due_at', label: 'Data programada', date: true }], executionFields) : [
      { key: 'machine_id', label: 'Máquina', searchable: true, options: machines.map(function(m) { return { value: m.id, label: m.machine_name || m.machine_code || 'Máquina' }; }) },
      { key: 'task_kind', label: 'Tipo', options: [{ value: 'preventive', label: 'Preventiva' }, { value: 'lubrication', label: 'Lubrificação' }] },
      { key: 'service_description', label: 'Serviço', multiline: true },
      { key: 'periodicity', label: 'Periodicidade', options: PERIODICITY_OPTIONS },
      { key: 'next_due_at', label: 'Próxima data programada', date: true },
      statusField
    ].concat(executionFields);
    var save = function(form) {
      if (!form.machine_id || !String(form.service_description || '').trim()) return notify('Selecione uma máquina e informe o serviço.');
      if (form.status === 'completed' && (!form.completed_date || !form.completed_time)) return notify('Informe a data e a hora da conclusão.');
      var checkedItems = Array.isArray(form.checked_items) ? form.checked_items : [];
      var data = {
        machine_id: form.machine_id, task_kind: form.task_kind || 'preventive',
        service_description: String(form.service_description).trim(), periodicity: form.periodicity || null,
        next_due_at: form.next_due_at ? form.next_due_at + (String(form.next_due_at).length === 10 ? 'T12:00:00' : '') : null,
        responsible_person: form.responsible_person || (form.status === 'completed' ? currentUserName() : null), status: form.status || 'pending',
        product_used: form.product_used || null, quantity_used: form.quantity_used ? Number(form.quantity_used) : null,
        quantity_unit: form.quantity_unit || null, observations: form.observations || null,
        started_at: form.started_date && form.started_time ? form.started_date + 'T' + form.started_time + ':00' : null,
        completed_at: form.completed_date && form.completed_time ? form.completed_date + 'T' + form.completed_time + ':00' : null,
        checked_items: checkedItems, items_total: checklist.length || null
      };
      var eventTask = data.periodicity === EVENT_PERIODICITY;
      var isCompleted = data.status === 'completed';
      var days = (selected && selected.interval_days) || periodicityDays(data.periodicity);
      var nextDate = isCompleted && days && !eventTask ? addDays(form.completed_date, days) : null;
      var needsNext = isCompleted && (!!nextDate || eventTask);
      if (nextDate) data.next_due_at = nextDate + 'T12:00:00';
      var alreadyScheduled = needsNext && allTasks.some(function(t) {
        return t.id !== (selected && selected.id) && t.status !== 'completed' &&
          t.machine_id === data.machine_id && t.service_description === data.service_description &&
          (eventTask || taskDate(t) === nextDate);
      });
      var operation = selected ? update({ id: selected.id, data: data }) : insert(data);
      operation.then(function() {
        if (!needsNext || alreadyScheduled) return null;
        return insert({
          machine_id: data.machine_id, task_kind: data.task_kind,
          service_description: data.service_description, periodicity: data.periodicity,
          routine_id: (selected && selected.routine_id) || null, interval_days: days || null,
          next_due_at: nextDate ? nextDate + 'T12:00:00' : null,
          responsible_person: isRoutine ? null : data.responsible_person,
          status: eventTask ? 'on_demand' : 'pending'
        });
      }).then(function() {
        query.refetch();
        setVisible(false);
        var itemsText = checklist.length ? ' Itens conferidos: ' + checkedItems.filter(function(id) { return checklist.some(function(item) { return item.id === id; }); }).length + ' de ' + checklist.length + '.' : '';
        if (nextDate) notify('Tarefa concluída. Próxima programada para ' + formatDate(nextDate) + (alreadyScheduled ? ' (já estava na lista).' : '.') + itemsText);
        else if (isCompleted && eventTask) notify('Tarefa concluída. Ela volta para a lista na próxima troca de urdume.' + itemsText);
        else if (isCompleted) notify('Tarefa concluída, mas sem periodicidade. Escolha Semanal, Mensal etc. para programar a próxima.' + itemsText);
        else notify('Tarefa salva.');
      }).catch(function(error) { notify(error.message || 'Não foi possível salvar.'); });
    };
    var splitExecutionDate = function(value) {
      var match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
      return match ? { date: match[1], time: match[2] } : { date: '', time: '' };
    };
    var savedStart = splitExecutionDate(selected && selected.started_at);
    var savedEnd = splitExecutionDate(selected && selected.completed_at);
    var initialTask = selected ? Object.assign({}, selected, {
      quantity_unit: selected.quantity_unit || storedUnits[String(selected.id)] || '',
      next_due_at: taskDate(selected) || null,
      started_date: savedStart.date,
      started_time: savedStart.time,
      completed_date: savedEnd.date,
      completed_time: savedEnd.time
    }) : selected;
    var taskDetail = function(item) {
      var parts = [machineLabel(machines, item.machine_id)];
      if (item.status === 'completed') parts.push('Concluída: ' + formatDate(item.completed_at));
      else parts.push(isEventTask(item) ? 'Na troca de urdume' : 'Data: ' + formatDate(item.next_due_at));
      var count = item.routine_id ? (ROUTINE_ITEMS[item.routine_id] || []).length : 0;
      if (count) parts.push(count + (count === 1 ? ' item' : ' itens'));
      if (item.responsible_person) parts.push(item.responsible_person);
      return parts.join(' · ');
    };
    var formExtra = selected ? machineLabel(machines, selected.machine_id) + (isEventTask(selected) ? ' · Fazer na troca de urdume' : selected.next_due_at ? ' · Data: ' + formatDate(selected.next_due_at) : '') : 'Ao marcar como Concluído, o app cria automaticamente a próxima tarefa com base na periodicidade.';
    return React.createElement(View, { style: styles.screen, componentId: 'tasks-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Tarefas', subtitle: 'Preventivas e lubrificação' }),
      React.createElement(ScrollView, { style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' }, contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: TAB_MENU_HEIGHT + insets.bottom + SCROLL_EXTRA_PADDING }, keyboardShouldPersistTaps: 'handled', componentId: 'tasks-scroll' },
        React.createElement(ActionButton, { label: 'Nova tarefa avulsa', icon: 'add-circle-outline', onPress: function() { setSelected(null); setVisible(true); }, componentId: 'tasks-add' }),
        React.createElement(View, { style: [styles.optionWrap, styles.sectionGap, { marginBottom: 12 }], componentId: 'tasks-filters' },
          filters.map(function(item, index) {
            var active = filter === item.key;
            return React.createElement(TouchableOpacity, { key: item.key, onPress: function() { setFilter(item.key); }, style: [styles.option, active && styles.optionSelected], componentId: 'tasks-filter-' + index },
              React.createElement(Text, { style: [styles.optionText, active && styles.optionTextSelected], componentId: 'tasks-filter-label-' + index }, item.label + ' (' + groups[item.key].length + ')')
            );
          })
        ),
        React.createElement(TextInput, {
          value: search,
          onChangeText: setSearch,
          placeholder: 'Buscar por máquina ou plano',
          placeholderTextColor: SECONDARY,
          style: [styles.input, { marginBottom: 12 }],
          autoCorrect: false,
          componentId: 'tasks-search'
        }),
        shown.length ? shown.map(function(item, index) {
          return React.createElement(DataCard, {
            key: item.id || index, id: 'task-' + index,
            code: (machineById[item.machine_id] ? machineById[item.machine_id].machine_code + ' · ' : '') + taskKindLabel(item),
            title: item.service_description, detail: taskDetail(item),
            status: isOverdue(item) ? 'overdue' : item.status,
            onPress: function() { setSelected(item); setVisible(true); }
          });
        }) : React.createElement(EmptyLine, { id: 'tasks', text: searchText ? 'Nenhuma tarefa encontrada para essa busca.' : filter === 'todo' ? 'Nenhuma tarefa para os próximos 7 dias.' : 'Nenhuma tarefa nesta lista.' }),
        list.length > LIMIT ? React.createElement(Notice, { id: 'tasks-limit', text: 'Mostrando ' + LIMIT + ' de ' + list.length + ' tarefas. Use a busca para encontrar uma máquina.' }) : null
      ),
      React.createElement(FormSheet, { visible: visible, title: selected ? selected.service_description || 'Atualizar tarefa' : 'Nova tarefa avulsa', initial: initialTask, fields: fields, onClose: function() { setVisible(false); }, onSave: save, extra: formExtra })
    );
  };
  // @end:TasksScreen

  // @section:CallsScreen @depends:[shared-ui,FormSheet,styles]
  var CallsScreen = function() {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    var query = useQuery('corrective_calls');
    var machines = useQuery('machines').data;
    var insert = useMutation('corrective_calls', 'insert').mutate;
    var update = useMutation('corrective_calls', 'update').mutate;
    var selectedState = React.useState(null);
    var selected = selectedState[0];
    var setSelected = selectedState[1];
    var visibleState = React.useState(false);
    var visible = visibleState[0];
    var setVisible = visibleState[1];
    var fields = [
      { key: 'machine_id', label: 'Máquina', searchable: true, options: machines.map(function(m) { return { value: m.id, label: m.machine_name || m.machine_code || 'Máquina' }; }) },
      { key: 'problem_description', label: 'Problema encontrado', multiline: true },
      { key: 'discipline', label: 'Área', options: [{ value: 'mechanical', label: 'Mecânica' }, { value: 'electrical', label: 'Elétrica' }] },
      { key: 'priority', label: 'Prioridade', options: [{ value: 'low', label: 'Baixa' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Alta' }, { value: 'critical', label: 'Crítica' }] },
      { key: 'responsible_person', label: 'Responsável', name: true },
      { key: 'status', label: 'Situação', options: [{ value: 'open', label: 'Aberto' }, { value: 'in_progress', label: 'Em andamento' }, { value: 'completed', label: 'Concluído' }] },
      { key: 'observations', label: 'Observações', multiline: true }
    ];
    var save = function(form) {
      if (!form.machine_id || !String(form.problem_description || '').trim()) return notify('Selecione a máquina e descreva o problema.');
      var data = {
        machine_id: form.machine_id, problem_description: form.problem_description.trim(),
        discipline: form.discipline || 'mechanical', priority: form.priority || 'normal',
        responsible_person: form.responsible_person || null, status: form.status || 'open',
        observations: form.observations || null
      };
      var operation = selected ? update({ id: selected.id, data: data }) : insert(data);
      operation.then(function() { query.refetch(); setVisible(false); notify('Chamado salvo.'); }).catch(function(error) { notify(error.message || 'Não foi possível salvar.'); });
    };
    return React.createElement(View, { style: styles.screen, componentId: 'calls-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Chamados', subtitle: 'Manutenção corretiva' }),
      React.createElement(ScrollView, { style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' }, contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: TAB_MENU_HEIGHT + insets.bottom + SCROLL_EXTRA_PADDING }, componentId: 'calls-scroll' },
        React.createElement(ActionButton, { label: 'Abrir chamado', icon: 'add-circle-outline', onPress: function() { setSelected(null); setVisible(true); }, componentId: 'calls-add' }),
        React.createElement(Text, { style: [styles.sectionTitle, styles.sectionGap], componentId: 'calls-list-title' }, 'Chamados registrados'),
        query.data.length ? query.data.map(function(item, index) {
          if (!item) return null;
          var priority = ({ low: 'Baixa', normal: 'Normal', high: 'Alta', critical: 'Crítica' })[item.priority] || 'Normal';
          return React.createElement(DataCard, { key: item.id || index, id: 'call-' + index, code: item.discipline === 'electrical' ? 'ELÉTRICA' : 'MECÂNICA', title: item.problem_description, detail: machineLabel(machines, item.machine_id) + ' · Prioridade ' + priority + ' · ' + (item.responsible_person || 'Sem responsável'), status: item.status, onPress: function() { setSelected(item); setVisible(true); } });
        }) : React.createElement(EmptyLine, { id: 'calls', text: 'Nenhum chamado registrado.' })
      ),
      React.createElement(FormSheet, { visible: visible, title: selected ? 'Atualizar chamado' : 'Novo chamado', initial: selected, fields: fields, onClose: function() { setVisible(false); }, onSave: save })
    );
  };
  // @end:CallsScreen

  // @section:ComponentsScreen @depends:[shared-ui,FormSheet,styles]
  var ComponentsScreen = function() {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    var query = useQuery('repair_components');
    var machines = useQuery('machines').data;
    var insert = useMutation('repair_components', 'insert').mutate;
    var update = useMutation('repair_components', 'update').mutate;
    var camera = useCamera();
    var selectedState = React.useState(null);
    var selected = selectedState[0];
    var setSelected = selectedState[1];
    var visibleState = React.useState(false);
    var visible = visibleState[0];
    var setVisible = visibleState[1];
    var machineOptions = machines.map(function(m) { return { value: m.id, label: m.machine_name || m.machine_code || 'Máquina' }; });
    var fields = [
      { key: 'component_code', label: 'Identificação individual' },
      { key: 'component_model', label: 'Modelo' },
      { key: 'component_kind', label: 'Tipo de componente' },
      { key: 'origin_machine_id', label: 'Máquina de origem', searchable: true, options: machineOptions },
      { key: 'repair_vendor', label: 'Fornecedor', name: true },
      { key: 'responsible_person', label: 'Responsável', name: true },
      { key: 'removed_at', label: 'Data da retirada', date: true },
      { key: 'expected_return_at', label: 'Previsão de retorno', date: true },
      { key: 'status', label: 'Etapa', options: [{ value: 'in_repair', label: 'Em conserto' }, { value: 'received', label: 'Recebido' }, { value: 'awaiting_installation', label: 'Aguardando instalação' }, { value: 'completed', label: 'Concluído' }] },
      { key: 'repair_cost', label: 'Valor do reparo (R$)', numeric: true },
      { key: 'received_by', label: 'Quem recebeu', name: true },
      { key: 'installed_machine_id', label: 'Equipamento de instalação', searchable: true, options: machineOptions },
      { key: 'test_result', label: 'Resultado do teste', multiline: true },
      { key: 'observations', label: 'Observações', multiline: true }
    ];
    var asDate = function(value) {
      return value && String(value).length === 10 ? value + 'T12:00:00' : value || null;
    };
    var save = function(form) {
      if (!String(form.component_code || '').trim() || !String(form.component_model || '').trim()) return notify('Informe identificação e modelo.');
      var data = {
        component_code: form.component_code.trim(), component_model: form.component_model.trim(),
        component_kind: form.component_kind || null, origin_machine_id: form.origin_machine_id || null,
        repair_vendor: form.repair_vendor || null, responsible_person: form.responsible_person || null,
        removed_at: asDate(form.removed_at), expected_return_at: asDate(form.expected_return_at),
        status: form.status || 'in_repair', repair_cost: form.repair_cost ? Number(form.repair_cost) : null,
        received_by: form.received_by || null, installed_machine_id: form.installed_machine_id || null,
        test_result: form.test_result || null, observations: form.observations || null
      };
      var operation = selected ? update({ id: selected.id, data: data }) : insert(data);
      operation.then(function() { query.refetch(); setVisible(false); notify('Componente salvo.'); }).catch(function(error) { notify(error.message || 'Não foi possível salvar.'); });
    };
    return React.createElement(View, { style: styles.screen, componentId: 'components-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Componentes', subtitle: 'Envio, retorno, instalação e teste' }),
      React.createElement(ScrollView, { style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' }, contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: TAB_MENU_HEIGHT + insets.bottom + SCROLL_EXTRA_PADDING }, componentId: 'components-scroll' },
        React.createElement(ActionButton, { label: 'Novo componente', icon: 'add-circle-outline', onPress: function() { setSelected(null); setVisible(true); }, componentId: 'components-add' }),
        React.createElement(Text, { style: [styles.sectionTitle, styles.sectionGap], componentId: 'components-list-title' }, 'Acompanhamento'),
        query.data.length ? query.data.map(function(item, index) {
          if (!item) return null;
          return React.createElement(DataCard, { key: item.id || index, id: 'component-' + index, code: item.component_code, title: (item.component_kind || 'Componente') + ' · ' + (item.component_model || 'Modelo não informado'), detail: machineLabel(machines, item.origin_machine_id) + ' → ' + (item.repair_vendor || 'Fornecedor não informado') + ' · Retorno ' + formatDate(item.expected_return_at), status: item.status, onPress: function() { setSelected(item); setVisible(true); } });
        }) : React.createElement(EmptyLine, { id: 'components', text: 'Nenhum componente em acompanhamento.' }),
        camera.photo?.uri ? React.createElement(Image, { source: { uri: camera.photo.uri }, style: styles.photo, resizeMode: 'cover', componentId: 'component-demo-photo' }) : null,
        camera.error ? React.createElement(Text, { style: styles.error, componentId: 'components-camera-error' }, camera.error) : null,
        React.createElement(ActionButton, { label: 'Foto do componente (demonstração)', icon: 'camera-outline', secondary: true, onPress: function() { camera.takePhoto().then(function(result) { if (result.error) notify(result.error); }); }, componentId: 'components-photo' }),
        React.createElement(Notice, { id: 'components-photo-note', text: 'A foto aparece nesta sessão. Associar fotos ao histórico requer configurar armazenamento de imagens.' })
      ),
      React.createElement(FormSheet, { visible: visible, title: selected ? 'Atualizar componente' : 'Novo componente', initial: selected, fields: fields, onClose: function() { setVisible(false); }, onSave: save })
    );
  };
  // @end:ComponentsScreen

  // @section:ReportsScreen @depends:[shared-ui,styles]
  var ReportsScreen = function(props) {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    var machines = useQuery('machines').data;
    var tasks = useQuery('maintenance_tasks').data;
    var calls = useQuery('corrective_calls').data;
    var components = useQuery('repair_components').data;
    var rows = [
      { label: 'Máquinas cadastradas', count: machines.length },
      { label: 'Tarefas concluídas', count: tasks.filter(function(x) { return x && x.status === 'completed'; }).length },
      { label: 'Tarefas pendentes ou atrasadas', count: tasks.filter(function(x) { return x && (x.status === 'pending' || x.status === 'overdue'); }).length },
      { label: 'Chamados não concluídos', count: calls.filter(function(x) { return x && x.status !== 'completed'; }).length },
      { label: 'Componentes em conserto', count: components.filter(function(x) { return x && x.status === 'in_repair'; }).length },
      { label: 'Componentes concluídos', count: components.filter(function(x) { return x && x.status === 'completed'; }).length }
    ];
    return React.createElement(View, { style: styles.screen, componentId: 'reports-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Relatórios', subtitle: 'Resumo dos registros neste dispositivo' }),
      React.createElement(ScrollView, { style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' }, contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: insets.bottom + SCROLL_EXTRA_PADDING }, componentId: 'reports-scroll' },
        React.createElement(ActionButton, { label: 'Voltar ao painel', secondary: true, icon: 'arrow-back-outline', onPress: function() { props.navigation.goBack(); }, componentId: 'reports-back' }),
        React.createElement(Text, { style: [styles.sectionTitle, styles.sectionGap], componentId: 'reports-title' }, 'Indicadores básicos'),
        rows.map(function(row, index) {
          return React.createElement(View, { key: row.label, style: styles.reportRow, componentId: 'report-row-' + index },
            React.createElement(Text, { style: styles.body, componentId: 'report-label-' + index }, row.label),
            React.createElement(Text, { style: styles.reportValue, componentId: 'report-value-' + index }, String(row.count))
          );
        }),
        React.createElement(Notice, { id: 'reports-pdf', text: 'Exportação em PDF e relatórios compartilhados ainda precisam de configuração. Os números acima são calculados somente dos registros locais.' })
      )
    );
  };
  // @end:ReportsScreen

  // @section:AccessScreen @depends:[shared-ui,styles,AuthGate]
  var AccessScreen = function(props) {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    var auth = useAuthInfo();
    var profile = auth.profile || {};
    var permissions = {
      admin: 'Cadastra e altera máquinas, registra tarefas, chamados e componentes e vê tudo.',
      mecanico: 'Registra tarefas, checklists, chamados, componentes e serviços terceirizados. Não altera o cadastro das máquinas.',
      consulta: 'Consulta máquinas, tarefas e histórico. Não faz alterações.'
    };
    return React.createElement(View, { style: styles.screen, componentId: 'access-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Minha conta', subtitle: 'Acesso ao banco central da manutenção' }),
      React.createElement(ScrollView, { style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' }, contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: insets.bottom + SCROLL_EXTRA_PADDING }, componentId: 'access-scroll' },
        React.createElement(ActionButton, { label: 'Voltar ao painel', secondary: true, icon: 'arrow-back-outline', onPress: function() { props.navigation.goBack(); }, componentId: 'access-back' }),
        React.createElement(View, { style: [styles.detailPanel, { marginTop: 8 }], componentId: 'access-card' },
          React.createElement(Text, { style: styles.sectionTitle, componentId: 'access-name' }, profile.full_name || 'Usuário'),
          React.createElement(Text, { style: styles.meta, componentId: 'access-email' }, profile.email || ''),
          React.createElement(View, { style: { flexDirection: 'row', marginTop: 12 }, componentId: 'access-role-row' },
            React.createElement(View, { style: [styles.badge, { borderColor: PRIMARY }], componentId: 'access-role' },
              React.createElement(Text, { style: [styles.badgeText, { color: PRIMARY }], componentId: 'access-role-label' }, ROLE_LABELS[profile.role] || profile.role || '')
            )
          ),
          React.createElement(Text, { style: [styles.body, { marginTop: 12 }], componentId: 'access-permissions' }, permissions[profile.role] || '')
        ),
        auth.isAdmin ? React.createElement(ActionButton, { label: 'Gerenciar usuários', icon: 'people-outline', onPress: function() { props.navigation.navigate('Usuários'); }, componentId: 'access-users' }) : null,
        React.createElement(Notice, { id: 'access-sync', text: 'Os registros ficam no banco central e aparecem em todos os celulares da equipe.' }),
        React.createElement(ActionButton, { label: 'Sair da conta', icon: 'log-out-outline', secondary: true, onPress: auth.signOut, componentId: 'access-signout' })
      )
    );
  };
  // @end:AccessScreen

  // @section:styles @depends:[theme]
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: BACKGROUND },
    header: { backgroundColor: PRIMARY, paddingHorizontal: 16, paddingBottom: 20 },
    headerEyebrow: { color: '#DCE8E5', fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
    headerTitle: { color: CARD, fontSize: 28, fontWeight: '700' },
    headerSubtitle: { color: '#DCE8E5', fontSize: 13, marginTop: 4 },
    sectionTitle: { color: TEXT, fontSize: 21, fontWeight: '700', marginBottom: 12 },
    sectionGap: { marginTop: 24 },
    body: { color: TEXT, fontSize: 16, lineHeight: 24 },
    meta: { color: SECONDARY, fontSize: 13, lineHeight: 20, marginTop: 8 },
    code: { color: PRIMARY, fontSize: 12, fontWeight: '700', letterSpacing: 1, flex: 1, marginRight: 8 },
    card: { backgroundColor: CARD, borderRadius: 16, flexDirection: 'row', marginBottom: 12, minHeight: 104 },
    stateStripe: { width: 8, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
    cardContent: { flex: 1, padding: 16 },
    cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    cardTitle: { color: TEXT, fontSize: 17, fontWeight: '600', lineHeight: 24 },
    badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
    badgeText: { fontSize: 11, fontWeight: '700' },
    button: { backgroundColor: ACCENT, borderRadius: 12, minHeight: 52, minWidth: 48, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
    buttonSecondary: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: TEXT, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    buttonSecondaryText: { color: PRIMARY },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
    metric: { backgroundColor: CARD, borderRadius: 16, padding: 16, width: '48%', minHeight: 132, marginBottom: 12 },
    metricNumber: { color: TEXT, fontSize: 32, fontWeight: '700', marginTop: 8 },
    metricLabel: { color: SECONDARY, fontSize: 13, fontWeight: '600', marginTop: 4 },
    empty: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 12, marginBottom: 12 },
    notice: { backgroundColor: '#DCE8E5', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 12, marginBottom: 12 },
    noticeText: { flex: 1, color: PRIMARY, fontSize: 14, lineHeight: 21, fontWeight: '500' },
    detailPanel: { backgroundColor: CARD, borderRadius: 16, padding: 16, marginTop: 16, marginBottom: 16 },
    photo: { width: '100%', height: 200, borderRadius: 12, backgroundColor: PALE, marginVertical: 16 },
    error: { color: RED, fontSize: 14, marginVertical: 8 },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,25,29,0.55)' },
    sheet: { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
    sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    closeButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
    fieldGroup: { marginBottom: 20 },
    fieldLabel: { color: TEXT, fontSize: 14, fontWeight: '600', marginBottom: 8 },
    input: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, color: TEXT, fontSize: 16, backgroundColor: PALE },
    multiline: { minHeight: 104 },
    optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: { minHeight: 48, minWidth: 48, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', backgroundColor: PALE },
    optionSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
    optionText: { color: TEXT, fontSize: 14, fontWeight: '600' },
    optionTextSelected: { color: CARD },
    reportRow: { backgroundColor: CARD, borderRadius: 12, padding: 16, minHeight: 64, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    reportValue: { color: PRIMARY, fontSize: 24, fontWeight: '700' },
    profile: { minHeight: 72, backgroundColor: CARD, borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: CARD },
    profileSelected: { borderColor: GREEN },
    rowTitle: { color: TEXT, fontSize: 16, fontWeight: '600' },
    dateField: { width: '100%' },
    dateInput: { minHeight: 52, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: PALE },
    dateValue: { color: TEXT, fontSize: 16 },
    datePlaceholder: { color: SECONDARY },
    calendarOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(10,25,29,0.55)' },
    calendarCard: { width: '100%', maxWidth: 380, backgroundColor: CARD, borderRadius: 20, padding: 20 },
    calendarHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    calendarNav: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: PALE },
    calendarMonth: { color: TEXT, fontSize: 18, fontWeight: '700' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calendarWeekdayCell: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center' },
    calendarWeekday: { color: SECONDARY, fontSize: 13, fontWeight: '700' },
    calendarDayCell: { width: '14.2857%', height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    calendarDaySelected: { backgroundColor: PRIMARY },
    calendarDayText: { color: TEXT, fontSize: 15, fontWeight: '600' },
    calendarDayTextSelected: { color: CARD },
    calendarCancel: { alignSelf: 'flex-end', minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, marginTop: 8 },
    calendarCancelText: { color: PRIMARY, fontSize: 16, fontWeight: '700' },
    checkHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
    checkCount: { color: SECONDARY, fontSize: 14, fontWeight: '600', flex: 1 },
    checkAll: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: PALE },
    checkAllText: { color: PRIMARY, fontSize: 14, fontWeight: '700' },
    checkItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: PALE, marginBottom: 8 },
    checkItemDone: { borderColor: GREEN, backgroundColor: '#E6F0EC' },
    checkTitle: { color: TEXT, fontSize: 15, fontWeight: '600', lineHeight: 21 },
    checkDetail: { color: SECONDARY, fontSize: 13, lineHeight: 19, marginTop: 2 },
    scanButton: { backgroundColor: PRIMARY, borderRadius: 20, paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center', gap: 12, marginBottom: 24 },
    scanButtonText: { color: CARD, fontSize: 22, fontWeight: '700' },
    scanButtonHint: { color: '#DCE8E5', fontSize: 14, textAlign: 'center', lineHeight: 20 },
    authEyebrow: { color: '#DCE8E5', fontSize: 12, fontWeight: '700', letterSpacing: 2, textAlign: 'center', marginBottom: 16 },
    authCard: { backgroundColor: CARD, borderRadius: 20, padding: 20, width: '100%', maxWidth: 420, alignSelf: 'center' },
    authTitle: { color: TEXT, fontSize: 26, fontWeight: '700', marginBottom: 8 },
    authInfo: { color: GREEN, fontSize: 14, lineHeight: 20, marginVertical: 8 }
  });
  // @end:styles

  // @section:QRScreen @depends:[shared-ui,styles]
  var findMachineByCode = function(machines, raw) {
    var text = String(raw || '').trim();
    var urlMatch = text.match(/[?&](?:maquina|machine|eq)=([^&#]+)/i);
    var key = decodeURIComponent(urlMatch ? urlMatch[1] : text).replace(/^IMETEXTIL\s*[:\-]\s*/i, '').trim().toLowerCase();
    if (!key) return null;
    return (machines || []).find(function(machine) {
      if (!machine) return false;
      return [machine.id, machine.machine_code, machine.machine_name].some(function(value) {
        return String(value || '').trim().toLowerCase() === key;
      }) || String(machine.id || '').toLowerCase() === 'eq-' + key.replace(/\s+/g, '-');
    }) || null;
  };
  var QRScreen = function(props) {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    var machines = useQuery('machines').data;
    var scanner = useBarcodeScanner();
    var searchState = React.useState('');
    var search = searchState[0];
    var setSearch = searchState[1];
    var busyState = React.useState(false);
    var busy = busyState[0];
    var setBusy = busyState[1];
    var openMachine = function(machine) {
      setSearch('');
      props.navigation.navigate('Máquinas', { machineId: machine.id, openedAt: Date.now() });
    };
    var startScan = function() {
      if (!scanner.isAvailable) return notify('A leitura de QR Code não está disponível neste aparelho. Digite o número da máquina abaixo.');
      setBusy(true);
      scanner.scan().then(function(result) {
        setBusy(false);
        if (!result) return;
        if (result.error) return notify(result.error);
        if (!result.value) return;
        var machine = findMachineByCode(machines, result.value);
        if (machine) openMachine(machine);
        else notify('QR Code lido (' + result.value + '), mas nenhuma máquina corresponde a ele.');
      }).catch(function(error) {
        setBusy(false);
        notify((error && error.message) || 'Não foi possível ler o QR Code.');
      });
    };
    var text = search.trim().toLowerCase();
    var found = text ? machines.filter(function(machine) {
      return machine && [machine.machine_code, machine.machine_name, machine.model, machine.serial_number].some(function(value) { return String(value || '').toLowerCase().indexOf(text) >= 0; });
    }).slice(0, 8) : [];
    return React.createElement(View, { style: styles.screen, componentId: 'qr-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Ler QR Code', subtitle: 'Aponte a câmera para a etiqueta da máquina' }),
      React.createElement(ScrollView, { style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' }, contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: TAB_MENU_HEIGHT + insets.bottom + SCROLL_EXTRA_PADDING }, keyboardShouldPersistTaps: 'handled', componentId: 'qr-scroll' },
        React.createElement(TouchableOpacity, { onPress: startScan, disabled: busy, activeOpacity: 0.85, style: [styles.scanButton, busy && styles.buttonDisabled], componentId: 'qr-scan' },
          React.createElement(Ionicons, { name: 'qr-code-outline', size: 72, color: ACCENT }),
          React.createElement(Text, { style: styles.scanButtonText, componentId: 'qr-scan-label' }, busy ? 'Lendo...' : 'Abrir câmera'),
          React.createElement(Text, { style: styles.scanButtonHint, componentId: 'qr-scan-hint' }, 'A ficha da máquina abre assim que o código for lido.')
        ),
        scanner.error ? React.createElement(Text, { style: styles.error, componentId: 'qr-error' }, scanner.error) : null,
        React.createElement(Text, { style: styles.sectionTitle, componentId: 'qr-manual-title' }, 'Ou digite o número da máquina'),
        React.createElement(TextInput, {
          value: search,
          onChangeText: setSearch,
          placeholder: 'Ex.: 115 ou Comp 01',
          placeholderTextColor: SECONDARY,
          style: [styles.input, { marginBottom: 12 }],
          autoCorrect: false,
          componentId: 'qr-search'
        }),
        found.map(function(machine, index) {
          return React.createElement(DataCard, { key: machine.id, id: 'qr-found-' + index, code: machine.machine_code, title: machine.machine_name, detail: [machine.model, machine.sector].filter(Boolean).join(' · '), status: machine.status, onPress: function() { openMachine(machine); } });
        }),
        text && !found.length ? React.createElement(EmptyLine, { id: 'qr-none', text: 'Nenhuma máquina encontrada.' }) : null,
        React.createElement(Notice, { id: 'qr-labels', text: 'Cada máquina precisa de uma etiqueta com QR Code. O código contém o número da máquina, por exemplo IMETEXTIL:115.' })
      )
    );
  };
  // @end:QRScreen

  // @section:AuthGate @depends:[imports,shared-ui,styles]
  var AuthContext = React.createContext({ profile: null, isAdmin: false, signOut: function() {} });
  var useAuthInfo = function() { return React.useContext(AuthContext); };
  var ROLE_LABELS = { admin: 'Administrador', mecanico: 'Mecânico', consulta: 'Consulta', bloqueado: 'Aguardando liberação' };
  var CenterCard = function(props) {
    var insets = useSafeAreaInsets();
    return React.createElement(ScrollView, { style: { flex: 1, backgroundColor: PRIMARY }, contentContainerStyle: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }, keyboardShouldPersistTaps: 'handled', componentId: 'auth-scroll-' + props.id },
      React.createElement(Text, { style: styles.authEyebrow, componentId: 'auth-eyebrow-' + props.id }, 'IMETEXTIL · MANUTENÇÃO'),
      React.createElement(View, { style: styles.authCard, componentId: 'auth-card-' + props.id }, props.children)
    );
  };
  var LoginScreen = function() {
    var modeState = React.useState('login');
    var mode = modeState[0];
    var setMode = modeState[1];
    var emailState = React.useState('');
    var email = emailState[0];
    var setEmail = emailState[1];
    var passwordState = React.useState('');
    var password = passwordState[0];
    var setPassword = passwordState[1];
    var nameState = React.useState('');
    var name = nameState[0];
    var setName = nameState[1];
    var busyState = React.useState(false);
    var busy = busyState[0];
    var setBusy = busyState[1];
    var messageState = React.useState(null);
    var message = messageState[0];
    var setMessage = messageState[1];
    var submit = function() {
      var db = getDb();
      var cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) return setMessage({ error: true, text: 'Informe e-mail e senha.' });
      if (mode === 'signup' && !name.trim()) return setMessage({ error: true, text: 'Informe seu nome.' });
      setBusy(true);
      setMessage(null);
      var request = mode === 'signup'
        ? db.auth.signUp({ email: cleanEmail, password: password, options: { data: { full_name: name.trim() } } })
        : db.auth.signInWithPassword({ email: cleanEmail, password: password });
      request.then(function(result) {
        setBusy(false);
        if (result.error) return setMessage({ error: true, text: friendlyDbError(result.error) });
        if (mode === 'signup' && !result.data.session) {
          setMode('login');
          setMessage({ error: false, text: 'Conta criada. Abra o e-mail que enviamos, confirme pelo link e depois entre aqui.' });
        }
      }).catch(function(error) {
        setBusy(false);
        setMessage({ error: true, text: friendlyDbError(error) });
      });
    };
    var signup = mode === 'signup';
    return React.createElement(CenterCard, { id: 'login' },
      React.createElement(Text, { style: styles.authTitle, componentId: 'login-title' }, signup ? 'Criar conta' : 'Entrar'),
      React.createElement(Text, { style: [styles.meta, { marginTop: 0, marginBottom: 16 }], componentId: 'login-subtitle' }, signup ? 'Use o e-mail cadastrado pela manutenção.' : 'Acesse com seu e-mail e senha.'),
      signup ? React.createElement(TextInput, { value: name, onChangeText: setName, placeholder: 'Seu nome', placeholderTextColor: SECONDARY, style: [styles.input, { marginBottom: 12 }], autoCapitalize: 'words', componentId: 'login-name' }) : null,
      React.createElement(TextInput, { value: email, onChangeText: setEmail, placeholder: 'E-mail', placeholderTextColor: SECONDARY, style: [styles.input, { marginBottom: 12 }], autoCapitalize: 'none', autoCorrect: false, keyboardType: 'email-address', componentId: 'login-email' }),
      React.createElement(TextInput, { value: password, onChangeText: setPassword, placeholder: signup ? 'Crie uma senha (mínimo 6 caracteres)' : 'Senha', placeholderTextColor: SECONDARY, style: [styles.input, { marginBottom: 16 }], secureTextEntry: true, autoCapitalize: 'none', autoCorrect: false, componentId: 'login-password' }),
      message ? React.createElement(Text, { style: message.error ? styles.error : styles.authInfo, componentId: 'login-message' }, message.text) : null,
      React.createElement(ActionButton, { label: busy ? 'Aguarde...' : signup ? 'Criar conta' : 'Entrar', icon: signup ? 'person-add-outline' : 'log-in-outline', disabled: busy, onPress: submit, componentId: 'login-submit' }),
      React.createElement(ActionButton, { label: signup ? 'Já tenho conta' : 'Primeiro acesso? Criar conta', secondary: true, onPress: function() { setMode(signup ? 'login' : 'signup'); setMessage(null); }, componentId: 'login-switch' })
    );
  };
  var MessageScreen = function(props) {
    return React.createElement(CenterCard, { id: props.id },
      React.createElement(Text, { style: styles.authTitle, componentId: props.id + '-title' }, props.title),
      React.createElement(Text, { style: [styles.body, { marginBottom: 16 }], componentId: props.id + '-text' }, props.text),
      props.onRetry ? React.createElement(ActionButton, { label: 'Tentar de novo', icon: 'refresh-outline', onPress: props.onRetry, componentId: props.id + '-retry' }) : null,
      props.onSignOut ? React.createElement(ActionButton, { label: 'Sair', icon: 'log-out-outline', secondary: true, onPress: props.onSignOut, componentId: props.id + '-signout' }) : null
    );
  };
  var AuthGate = function(props) {
    var sessionState = React.useState(undefined);
    var session = sessionState[0];
    var setSession = sessionState[1];
    var profileState = React.useState(null);
    var profile = profileState[0];
    var setProfile = profileState[1];
    var readyState = React.useState(false);
    var ready = readyState[0];
    var setReady = readyState[1];
    var errorState = React.useState(null);
    var loadError = errorState[0];
    var setLoadError = errorState[1];
    var db = getDb();
    React.useEffect(function() {
      if (!db) return;
      db.auth.getSession().then(function(result) { setSession((result.data && result.data.session) || null); });
      var subscription = db.auth.onAuthStateChange(function(event, nextSession) { setSession(nextSession || null); });
      return function() { try { subscription.data.subscription.unsubscribe(); } catch (error) {} };
    }, []);
    var userId = session && session.user && session.user.id;
    var loadEverything = function() {
      setReady(false);
      setLoadError(null);
      db.from('profiles').select('id,email,full_name,role').eq('id', userId).maybeSingle().then(function(result) {
        if (result.error) throw result.error;
        var nextProfile = result.data || { id: userId, email: session.user.email, full_name: session.user.email, role: 'bloqueado' };
        IMX.profile = nextProfile;
        setProfile(nextProfile);
        if (nextProfile.role === 'bloqueado') return setReady(true);
        return Promise.all(DB_TABLES.map(function(table) { return loadTable(table); })).then(function() {
          startRealtime();
          setReady(true);
        });
      }).catch(function(error) { setLoadError(friendlyDbError(error)); });
    };
    React.useEffect(function() {
      if (!db) return;
      if (!userId) { resetDbCache(); setProfile(null); setReady(false); return; }
      loadEverything();
    }, [userId]);
    var signOut = function() { resetDbCache(); db.auth.signOut(); };
    if (!db) return React.createElement(MessageScreen, { id: 'auth-config', title: 'Falta ligar o banco', text: 'Cole a chave anon do Supabase no código, no lugar de COLE_AQUI_A_CHAVE_ANON, e salve.' });
    if (session === undefined) return React.createElement(MessageScreen, { id: 'auth-wait', title: 'Carregando', text: 'Conectando ao banco central...' });
    if (!session) return React.createElement(LoginScreen);
    if (loadError) return React.createElement(MessageScreen, { id: 'auth-error', title: 'Não foi possível carregar', text: loadError, onRetry: loadEverything, onSignOut: signOut });
    if (!profile || !ready) return React.createElement(MessageScreen, { id: 'auth-loading', title: 'Carregando', text: 'Buscando máquinas e tarefas...' });
    if (profile.role === 'bloqueado') return React.createElement(MessageScreen, { id: 'auth-blocked', title: 'Acesso aguardando liberação', text: 'Sua conta (' + profile.email + ') foi criada, mas ainda não está liberada. Peça ao administrador da manutenção para liberar seu e-mail.', onRetry: loadEverything, onSignOut: signOut });
    return React.createElement(AuthContext.Provider, { value: { profile: profile, isAdmin: profile.role === 'admin', signOut: signOut } }, props.children);
  };
  // @end:AuthGate

  // @section:UsersScreen @depends:[shared-ui,FormSheet,styles,AuthGate]
  var ROLE_OPTIONS = [
    { value: 'mecanico', label: 'Mecânico' },
    { value: 'admin', label: 'Administrador' },
    { value: 'consulta', label: 'Consulta' },
    { value: 'bloqueado', label: 'Bloqueado' }
  ];
  var SHIFT_OPTIONS = [
    { value: '1o turno', label: '1º turno' },
    { value: '2o turno', label: '2º turno' },
    { value: '3o turno', label: '3º turno' },
    { value: 'Administrativo', label: 'Administrativo' }
  ];
  var UsersScreen = function(props) {
    var insets = useSafeAreaInsets();
    var height = useWindowDimensions().height;
    var auth = useAuthInfo();
    var myEmail = String((auth.profile && auth.profile.email) || '').toLowerCase();
    var usersState = React.useState(null);
    var users = usersState[0];
    var setUsers = usersState[1];
    var errorState = React.useState(null);
    var loadError = errorState[0];
    var setLoadError = errorState[1];
    var editState = React.useState(null);
    var editing = editState[0];
    var setEditing = editState[1];
    var visibleState = React.useState(false);
    var visible = visibleState[0];
    var setVisible = visibleState[1];
    var load = function() {
      var db = getDb();
      setLoadError(null);
      Promise.all([
        db.from('allowed_users').select('email,full_name,role,shift'),
        db.from('profiles').select('email,full_name,role')
      ]).then(function(results) {
        if (results[0].error) throw results[0].error;
        if (results[1].error) throw results[1].error;
        var accounts = {};
        (results[1].data || []).forEach(function(p) { accounts[String(p.email).toLowerCase()] = p; });
        var list = (results[0].data || []).map(function(u) {
          return Object.assign({}, u, { email: String(u.email).toLowerCase(), hasAccount: !!accounts[String(u.email).toLowerCase()] });
        });
        var listed = {};
        list.forEach(function(u) { listed[u.email] = true; });
        (results[1].data || []).forEach(function(p) {
          var email = String(p.email).toLowerCase();
          if (!listed[email]) list.push({ email: email, full_name: p.full_name, role: 'bloqueado', shift: null, hasAccount: true, pending: true });
        });
        var order = { pending: 0, admin: 1, mecanico: 2, consulta: 3, bloqueado: 4 };
        list.sort(function(a, b) {
          var oa = a.pending ? 0 : order[a.role] || 9;
          var ob = b.pending ? 0 : order[b.role] || 9;
          return oa !== ob ? oa - ob : String(a.full_name || '').localeCompare(String(b.full_name || ''));
        });
        setUsers(list);
      }).catch(function(error) { setLoadError(friendlyDbError(error)); });
    };
    React.useEffect(function() { load(); }, []);
    var fields = [
      { key: 'full_name', label: 'Nome', name: true },
      { key: 'email', label: 'E-mail (o mesmo que a pessoa vai usar no app)' },
      { key: 'role', label: 'Função no app', options: ROLE_OPTIONS },
      { key: 'shift', label: 'Turno', options: SHIFT_OPTIONS }
    ];
    var save = function(form) {
      var email = String(form.email || '').trim().toLowerCase();
      var name = String(form.full_name || '').trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return notify('Informe o nome e um e-mail válido.');
      if (email === myEmail && form.role !== 'admin') return notify('Você não pode tirar o seu próprio acesso de administrador.');
      var db = getDb();
      db.from('allowed_users').upsert({ email: email, full_name: name, role: form.role || 'mecanico', shift: form.shift || null }, { onConflict: 'email' }).then(function(result) {
        if (result.error) throw result.error;
        setVisible(false);
        load();
        notify(editing && editing.email ? 'Usuário atualizado.' : 'Usuário adicionado. Peça para ' + name + ' abrir o app e tocar em "Primeiro acesso? Criar conta" com o e-mail ' + email + '.');
      }).catch(function(error) { notify(friendlyDbError(error)); });
    };
    var openNew = function() { setEditing({ id: 'novo-' + Date.now(), role: 'mecanico' }); setVisible(true); };
    var openEdit = function(user) { setEditing(Object.assign({ id: 'editar-' + user.email + '-' + Date.now() }, user, { role: user.pending ? 'mecanico' : user.role })); setVisible(true); };
    var roleColor = function(role) { return role === 'bloqueado' ? RED : role === 'admin' ? PRIMARY : role === 'consulta' ? SECONDARY : GREEN; };
    return React.createElement(View, { style: styles.screen, componentId: 'users-screen' },
      React.createElement(StatusBar, { backgroundColor: PRIMARY, barStyle: 'light-content' }),
      React.createElement(Header, { title: 'Usuários', subtitle: 'Quem pode usar o app da manutenção' }),
      React.createElement(ScrollView, { style: { height: height - insets.top - insets.bottom - 104, overflow: 'auto' }, contentContainerStyle: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: insets.bottom + SCROLL_EXTRA_PADDING }, componentId: 'users-scroll' },
        React.createElement(ActionButton, { label: 'Voltar', secondary: true, icon: 'arrow-back-outline', onPress: function() { props.navigation.goBack(); }, componentId: 'users-back' }),
        React.createElement(ActionButton, { label: 'Adicionar usuário', icon: 'person-add-outline', onPress: openNew, componentId: 'users-add' }),
        loadError ? React.createElement(Text, { style: styles.error, componentId: 'users-error' }, loadError) : null,
        !users && !loadError ? React.createElement(Text, { style: styles.meta, componentId: 'users-loading' }, 'Carregando usuários...') : null,
        (users || []).map(function(user, index) {
          var color = roleColor(user.role);
          return React.createElement(TouchableOpacity, { key: user.email, onPress: function() { openEdit(user); }, style: styles.card, activeOpacity: 0.8, componentId: 'user-' + index },
            React.createElement(View, { style: [styles.stateStripe, { backgroundColor: user.pending ? ACCENT : color }], componentId: 'user-stripe-' + index }),
            React.createElement(View, { style: styles.cardContent, componentId: 'user-content-' + index },
              React.createElement(View, { style: styles.cardTop, componentId: 'user-top-' + index },
                React.createElement(Text, { style: styles.code, componentId: 'user-shift-' + index }, user.pending ? 'PEDIU ACESSO' : String(user.shift || 'SEM TURNO').toUpperCase()),
                React.createElement(View, { style: [styles.badge, { borderColor: color }], componentId: 'user-role-' + index },
                  React.createElement(Text, { style: [styles.badgeText, { color: color }], componentId: 'user-role-label-' + index }, user.pending ? 'Aguardando liberação' : ROLE_LABELS[user.role] || user.role)
                )
              ),
              React.createElement(Text, { style: styles.cardTitle, componentId: 'user-name-' + index }, user.full_name || user.email),
              React.createElement(Text, { style: styles.meta, componentId: 'user-email-' + index }, user.email + ' · ' + (user.hasAccount ? 'Conta criada' : 'Ainda não criou a conta') + (user.email === myEmail ? ' · Você' : ''))
            )
          );
        }),
        React.createElement(Notice, { id: 'users-help', text: 'Toque em um usuário para mudar a função ou bloquear. Quem aparece como "Pediu acesso" criou conta com um e-mail que não estava na lista: toque nele e escolha a função para liberar.' })
      ),
      React.createElement(FormSheet, { visible: visible, title: editing && editing.email ? 'Editar usuário' : 'Novo usuário', initial: editing, fields: fields, onClose: function() { setVisible(false); }, onSave: save, extra: 'Mecânico registra serviços. Consulta só visualiza. Bloqueado não acessa o app. Administrador altera máquinas e usuários.' })
    );
  };
  // @end:UsersScreen

  // @section:TabNavigator @depends:[HomeScreen,MachinesScreen,TasksScreen,CallsScreen,ComponentsScreen,navigation-setup]
  var TabNavigator = function() {
    var insets = useSafeAreaInsets();
    var icons = { Início: 'grid-outline', Máquinas: 'settings-outline', 'Ler QR': 'qr-code-outline', Tarefas: 'checkbox-outline', Chamados: 'alert-circle-outline', Componentes: 'construct-outline' };
    return React.createElement(View, { style: { flex: 1, width: '100%', height: '100%', overflow: 'hidden' }, componentId: 'tabs-container' },
      React.createElement(Tab.Navigator, {
        screenOptions: function(routeInfo) {
          return {
            headerShown: false,
            tabBarActiveTintColor: ACCENT,
            tabBarInactiveTintColor: '#DCE8E5',
            tabBarActiveBackgroundColor: PRIMARY,
            tabBarInactiveBackgroundColor: PRIMARY,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            tabBarItemStyle: { padding: 0 },
            tabBarStyle: { position: 'absolute', bottom: 0, height: Platform.OS === 'web' ? TAB_MENU_HEIGHT : TAB_MENU_HEIGHT + insets.bottom, paddingBottom: 0, borderTopWidth: 0, backgroundColor: PRIMARY },
            tabBarIcon: function(info) { return React.createElement(Ionicons, { name: icons[routeInfo.route.name] || 'ellipse-outline', size: 21, color: info.color }); }
          };
        }
      },
        React.createElement(Tab.Screen, { name: 'Início', component: HomeScreen }),
        React.createElement(Tab.Screen, { name: 'Máquinas', component: MachinesScreen }),
        React.createElement(Tab.Screen, { name: 'Ler QR', component: QRScreen }),
        React.createElement(Tab.Screen, { name: 'Tarefas', component: TasksScreen }),
        React.createElement(Tab.Screen, { name: 'Chamados', component: CallsScreen }),
        React.createElement(Tab.Screen, { name: 'Componentes', component: ComponentsScreen })
      )
    );
  };
  // @end:TabNavigator

  // @section:MainNavigator @depends:[TabNavigator,ReportsScreen,AccessScreen,navigation-setup]
  var MainNavigator = function() {
    return React.createElement(Stack.Navigator, { initialRouteName: 'Principal', screenOptions: { headerShown: false } },
      React.createElement(Stack.Screen, { name: 'Principal', component: TabNavigator }),
      React.createElement(Stack.Screen, { name: 'Relatórios', component: ReportsScreen }),
      React.createElement(Stack.Screen, { name: 'Acesso', component: AccessScreen }),
      React.createElement(Stack.Screen, { name: 'Usuários', component: UsersScreen })
    );
  };
  // @end:MainNavigator

  // @section:return @depends:[ThemeProvider,MainNavigator,sample-data]
  return React.createElement(ThemeProvider, null,
    React.createElement(View, { style: { flex: 1, width: '100%', height: '100%' }, componentId: 'app-root' },
      React.createElement(AuthGate, null, React.createElement(MainNavigator))
    )
  );
  // @end:return
};
return ComponentFunction;
};
