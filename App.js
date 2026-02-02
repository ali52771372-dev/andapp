import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Switch,
  Platform,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

const { width } = Dimensions.get('window');

// ============================================================
// PERSIAN CALENDAR UTILITIES
// ============================================================
function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy > 1600 ? 979 : 0;
  gy -= gy > 1600 ? 1600 : 621;
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  let jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 6);
  let gy = 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd2 = days + 1;
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (; gm < 13 && gd2 > sal_a[gm]; gm++) gd2 -= sal_a[gm];
  return [gy, gm, gd2];
}

function jalaliToDate(s) {
  const p = s.split('/').map(Number);
  const [gy, gm, gd] = jalaliToGregorian(p[0], p[1], p[2]);
  return new Date(gy, gm - 1, gd);
}
function dateToJalali(d) {
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${String(jm).padStart(2,'0')}/${String(jd).padStart(2,'0')}`;
}
function getTodayJalali() { return dateToJalali(new Date()); }
function addDaysToJalali(s, days) { const d = jalaliToDate(s); d.setDate(d.getDate() + days); return dateToJalali(d); }
function jalaliCompare(a, b) { return jalaliToDate(a).getTime() - jalaliToDate(b).getTime(); }
function daysDifference(a, b) {
  return Math.round((jalaliToDate(b).getTime() - jalaliToDate(a).getTime()) / 86400000);
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [screen, setScreen] = useState('home');
  const [cattleData, setCattleData] = useState({ default: [] });
  const [sectionNames, setSectionNames] = useState({ default: 'جایگاه اصلی' });
  const [deletedCattle, setDeletedCattle] = useState([]);
  const [dailyNotes, setDailyNotes] = useState({});
  const [protocols, setProtocols] = useState({});
  const [cattleProtocols, setCattleProtocols] = useState({});
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [cattleNumber, setCattleNumber] = useState('');
  const [selectedSection, setSelectedSection] = useState('default');
  const [newSectionName, setNewSectionName] = useState('');
  const [searchNumber, setSearchNumber] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [transferNumber, setTransferNumber] = useState('');
  const [transferToSection, setTransferToSection] = useState('');

  const [newProtocolName, setNewProtocolName] = useState('');
  const [newStepDay, setNewStepDay] = useState('');
  const [newStepHormone, setNewStepHormone] = useState('');
  const [newStepDosage, setNewStepDosage] = useState('');
  const [newStepNote, setNewStepNote] = useState('');
  const [editingProtocol, setEditingProtocol] = useState(null);

  const [assignCattleNum, setAssignCattleNum] = useState('');
  const [assignProtocolId, setAssignProtocolId] = useState('');
  const [assignStartDate, setAssignStartDate] = useState('');

  const [notesDate, setNotesDate] = useState('');
  const [notesText, setNotesText] = useState('');
  const [expandedSections, setExpandedSections] = useState({});
  const [showNewSectionModal, setShowNewSectionModal] = useState(false);

  // ---- LOAD / SAVE ----
  useEffect(() => { loadAll(); setNotesDate(getTodayJalali()); setAssignStartDate(getTodayJalali()); }, []);

  const loadAll = async () => {
    try {
      const keys = ['cattleData','sectionNames','deletedCattle','dailyNotes','protocols','cattleProtocols','isDarkMode'];
      const setters = [setCattleData,setSectionNames,setDeletedCattle,setDailyNotes,setProtocols,setCattleProtocols,setIsDarkMode];
      for (let i = 0; i < keys.length; i++) { const v = await AsyncStorage.getItem(keys[i]); if (v) setters[i](JSON.parse(v)); }
    } catch(e) { console.error(e); }
  };

  const saveAll = useCallback(async () => {
    try {
      const map = { cattleData, sectionNames, deletedCattle, dailyNotes, protocols, cattleProtocols, isDarkMode };
      for (const k in map) await AsyncStorage.setItem(k, JSON.stringify(map[k]));
    } catch(e) { console.error(e); }
  }, [cattleData, sectionNames, deletedCattle, dailyNotes, protocols, cattleProtocols, isDarkMode]);

  useEffect(() => { saveAll(); }, [saveAll]);

  // ---- BACKUP / RESTORE ----
  const exportBackup = async () => {
    try {
      const backup = { cattleData, sectionNames, deletedCattle, dailyNotes, protocols, cattleProtocols, backupDate: getTodayJalali(), version: '2.1.0' };
      const path = FileSystem.cacheDirectory + 'backup_' + getTodayJalali().replace(/\//g,'-') + '.json';
      await FileSystem.writeAsStringAsync(path, JSON.stringify(backup, null, 2));
      await Share.share({ files: [path], title: 'بک آپ گاوداری', message: 'فایل بک آپ گاوداری' });
    } catch(e) { Alert.alert('خطا', 'نتوانستیم بک آپ ایجاد کنیم'); }
  };

  const importBackup = async () => {
    try {
      const res = await DocumentPicker.pick({ types: [DocumentPicker.types.allFiles] });
      if (res && res[0]) {
        const content = await FileSystem.readAsStringAsync(res[0].uri);
        const b = JSON.parse(content);
        if (!b.cattleData || !b.sectionNames) return Alert.alert('خطا','فایل معتبر نیست');
        Alert.alert('تایید بک آپ',
          `بک آپ از تاریخ ${b.backupDate || 'نامشخص'} وارد شود؟\nداده‌های فعلی جایگزین می‌شود.`,
          [{ text:'انصراف', style:'cancel' },
           { text:'بله، وارد بک آپ', style:'destructive', onPress: () => {
              if(b.cattleData) setCattleData(b.cattleData);
              if(b.sectionNames) setSectionNames(b.sectionNames);
              if(b.deletedCattle) setDeletedCattle(b.deletedCattle);
              if(b.dailyNotes) setDailyNotes(b.dailyNotes);
              if(b.protocols) setProtocols(b.protocols);
              if(b.cattleProtocols) setCattleProtocols(b.cattleProtocols);
              Alert.alert('موفق','بک آپ با موفقیت وارد شد');
           }}]);
      }
    } catch(e) { if(e.code !== 'dismiss') Alert.alert('خطا','نتوانستیم بک آپ را وارد کنیم'); }
  };

  // ---- THEME ----
  const t = {
    bg: isDarkMode?'#1a1a2e':'#f0f2f5',
    card: isDarkMode?'#16213e':'#fff',
    cardAlt: isDarkMode?'#0f3460':'#f5f7fa',
    text: isDarkMode?'#e8e8e8':'#1e2a3a',
    textSec: isDarkMode?'#8899aa':'#6c7a8a',
    primary:'#5b6abf',
    primaryLight: isDarkMode?'#1e2a5e':'#eef0fc',
    success:'#27ae60',
    successLight: isDarkMode?'#1e4a36':'#eafaf1',
    danger:'#e74c3c',
    dangerLight: isDarkMode?'#4a1e1e':'#fdf2f0',
    warning:'#f39c12',
    warningLight: isDarkMode?'#4a3a1e':'#fef9ee',
    info:'#2980b9',
    infoLight: isDarkMode?'#1e3a5e':'#eef6fc',
    border: isDarkMode?'#2a3a4a':'#e2e6ea',
    inputBg: isDarkMode?'#0f3460':'#fff',
    navBg: isDarkMode?'#16213e':'#fff',
    headerBg: isDarkMode?'#0f3460':'#5b6abf',
  };

  // ---- HELPERS ----
  const getTotalCount = () => Object.values(cattleData).reduce((s,a) => s + a.length, 0);
  const findCattleSection = (num) => { for(let s in cattleData) if(cattleData[s].includes(num)) return s; return null; };

  const getUpcomingInjections = useCallback((days) => {
    const today = getTodayJalali();
    const res = [];
    for(let c in cattleProtocols)
      for(let a of cattleProtocols[c])
        for(let step of a.steps) {
          if(step.done) continue;
          const diff = daysDifference(today, step.injectionDate);
          if(diff >= 0 && diff <= days)
            res.push({ cattleNum:c, hormoneName:step.hormoneName, dosage:step.dosage, note:step.note,
              injectionDate:step.injectionDate, dayOffset:step.dayOffset, assignmentId:a.id,
              protocolName:a.protocolName, daysFromNow:diff });
        }
    res.sort((a,b) => jalaliCompare(a.injectionDate, b.injectionDate));
    return res;
  }, [cattleProtocols]);

  // گروه‌بندی به نام هورمون
  const groupByHormone = (list) => {
    const map = {};
    list.forEach(inj => {
      const key = inj.hormoneName + '|||' + inj.dosage;
      if(!map[key]) map[key] = { hormoneName:inj.hormoneName, dosage:inj.dosage, items:[] };
      map[key].items.push(inj);
    });
    return Object.values(map);
  };

  // گروه‌بندی هفته آینده: تاریخ → هورمون
  const groupNext7ByDate = (list) => {
    const dateMap = {};
    list.forEach(inj => {
      if(!dateMap[inj.injectionDate]) dateMap[inj.injectionDate] = [];
      dateMap[inj.injectionDate].push(inj);
    });
    return Object.keys(dateMap).sort((a,b) => jalaliCompare(a,b)).map(date => ({
      date, daysFromNow: dateMap[date][0].daysFromNow, groups: groupByHormone(dateMap[date])
    }));
  };

  const markDone = (cattleNum, assignmentId, dayOffset) => {
    const u = JSON.parse(JSON.stringify(cattleProtocols));
    const a = (u[cattleNum]||[]).find(x => x.id === assignmentId);
    if(a){ const s = a.steps.find(x => x.dayOffset === dayOffset); if(s) s.done = true; }
    setCattleProtocols(u);
  };

  // ---- CATTLE ----
  const addCattle = () => {
    const num = cattleNumber.trim();
    if(!num) return Alert.alert('خطا','شماره دام را وارد کنید');
    if(findCattleSection(num)) return Alert.alert('خطا',`دام ${num} قبلاً ثبت شده است`);
    const nd = {...cattleData}; if(!nd[selectedSection]) nd[selectedSection]=[];
    nd[selectedSection].push(num); setCattleData(nd); setCattleNumber('');
    Alert.alert('موفق',`دام ${num} اضافه شد`);
  };
  const deleteCattle = (num, sec) => {
    Alert.alert('تایید حذف',`دام ${num} حذف شود؟`,[
      {text:'انصراف',style:'cancel'},
      {text:'حذف',style:'destructive',onPress:()=>{
        const nd={...cattleData}; nd[sec]=nd[sec].filter(n=>n!==num); setCattleData(nd);
        setDeletedCattle([...deletedCattle,{num,date:getTodayJalali()}]);
        const nc={...cattleProtocols}; delete nc[num]; setCattleProtocols(nc);
      }}]);
  };
  const searchCattle = () => {
    const num = searchNumber.trim();
    if(!num) return Alert.alert('خطا','شماره دام را وارد کنید');
    const sec = findCattleSection(num);
    setSearchResult(sec ? {found:true,section:sec,num} : {found:false,num});
  };
  const transferCattle = () => {
    const num = transferNumber.trim();
    if(!num||!transferToSection) return Alert.alert('خطا','فیلدها را پر کنید');
    const from = findCattleSection(num);
    if(!from) return Alert.alert('خطا','دام یافت نشد');
    if(from===transferToSection) return Alert.alert('خطا','دام در این جایگاه است');
    const nd={...cattleData}; nd[from]=nd[from].filter(n=>n!==num);
    if(!nd[transferToSection]) nd[transferToSection]=[]; nd[transferToSection].push(num);
    setCattleData(nd); setTransferNumber('');
    Alert.alert('موفق',`دام ${num} به "${sectionNames[transferToSection]}" منتقل شد`);
  };
  const addNewSection = () => {
    const name = newSectionName.trim();
    if(!name) return Alert.alert('خطا','نام جایگاه را وارد کنید');
    for(let id in sectionNames) if(sectionNames[id]===name) return Alert.alert('خطا','این نام قبلاً استفاده شده');
    const id='sec_'+Date.now();
    setSectionNames({...sectionNames,[id]:name}); setCattleData({...cattleData,[id]:[]});
    setNewSectionName(''); setShowNewSectionModal(false);
    Alert.alert('موفق',`جایگاه "${name}" ایجاد شد`);
  };
  const deleteSection = (id) => {
    if(id==='default') return Alert.alert('خطا','جایگاه اصلی حذف‌پذیر نیست');
    Alert.alert('تایید',`جایگاه "${sectionNames[id]}" حذف شود؟`,[
      {text:'انصراف',style:'cancel'},
      {text:'حذف',style:'destructive',onPress:()=>{
        const nd={...cattleData}; nd.default=[...(nd.default||[]),...(nd[id]||[])]; delete nd[id]; setCattleData(nd);
        const ns={...sectionNames}; delete ns[id]; setSectionNames(ns);
      }}]);
  };

  // ---- PROTOCOL ----
  const createProtocol = () => {
    if(!newProtocolName.trim()) return Alert.alert('خطا','نام پروتکل را وارد کنید');
    const id='proto_'+Date.now(); const p={name:newProtocolName.trim(),steps:[]};
    setProtocols({...protocols,[id]:p}); setEditingProtocol({id,name:p.name,steps:[]}); setNewProtocolName('');
  };
  const addStepToProtocol = () => {
    if(!editingProtocol) return;
    const day = parseInt(newStepDay,10);
    if(isNaN(day)) return Alert.alert('خطا','روز را به عدد وارد کنید');
    if(!newStepHormone.trim()) return Alert.alert('خطا','نام هورمون را وارد کنید');
    if(!newStepDosage.trim()) return Alert.alert('خطا','دوز را وارد کنید');
    if(editingProtocol.steps.find(s=>s.dayOffset===day)) return Alert.alert('خطا',`روز ${day} قبلاً تعریف شده`);
    const steps=[...editingProtocol.steps,{dayOffset:day,hormoneName:newStepHormone.trim(),dosage:newStepDosage.trim(),note:newStepNote.trim()}].sort((a,b)=>a.dayOffset-b.dayOffset);
    const u={...editingProtocol,steps}; setEditingProtocol(u);
    setProtocols({...protocols,[u.id]:{name:u.name,steps}});
    setNewStepDay(''); setNewStepHormone(''); setNewStepDosage(''); setNewStepNote('');
  };
  const removeStepFromProtocol = (dayOffset) => {
    if(!editingProtocol) return;
    const steps = editingProtocol.steps.filter(s=>s.dayOffset!==dayOffset);
    const u={...editingProtocol,steps}; setEditingProtocol(u);
    setProtocols({...protocols,[u.id]:{name:u.name,steps}});
  };
  const deleteProtocol = (id) => {
    Alert.alert('تایید','این پروتکل حذف شود؟',[
      {text:'انصراف',style:'cancel'},
      {text:'حذف',style:'destructive',onPress:()=>{
        const np={...protocols}; delete np[id]; setProtocols(np);
        if(editingProtocol&&editingProtocol.id===id) setEditingProtocol(null);
      }}]);
  };

  // ---- ASSIGN ----
  const assignProtocol = () => {
    const num = assignCattleNum.trim();
    if(!num) return Alert.alert('خطا','شماره دام را وارد کنید');
    if(!assignProtocolId) return Alert.alert('خطا','یک پروتکل انتخاب کنید');
    if(!assignStartDate) return Alert.alert('خطا','تاریخ شروع را وارد کنید');
    const proto = protocols[assignProtocolId];
    if(!proto) return Alert.alert('خطا','پروتکل نامعتبر');
    const steps = proto.steps.map(s=>({
      dayOffset:s.dayOffset, hormoneName:s.hormoneName, dosage:s.dosage, note:s.note,
      injectionDate:addDaysToJalali(assignStartDate, s.dayOffset), done:false
    }));
    const nc = JSON.parse(JSON.stringify(cattleProtocols));
    if(!nc[num]) nc[num]=[];
    nc[num].push({id:'asgn_'+Date.now(), protocolId:assignProtocolId, protocolName:proto.name, startDate:assignStartDate, steps});
    setCattleProtocols(nc); setAssignCattleNum(''); setAssignProtocolId('');
    Alert.alert('موفق',`پروتکل "${proto.name}" به دام ${num} تخصیص داده شد`);
  };

  // ---- NOTES ----
  const saveDailyNote = () => {
    if(!notesDate||!notesText.trim()) return Alert.alert('خطا','تاریخ و متن یادداشت وارد کنید');
    setDailyNotes({...dailyNotes,[notesDate]:notesText.trim()}); setNotesText('');
    Alert.alert('موفق','یادداشت ذخیره شد');
  };
  const deleteNote = (date) => {
    Alert.alert('تایید','یادداشت حذف شود؟',[
      {text:'انصراف',style:'cancel'},
      {text:'حذف',style:'destructive',onPress:()=>{ const nn={...dailyNotes}; delete nn[date]; setDailyNotes(nn); }}]);
  };
  const toggleSection = (id) => setExpandedSections(p=>({...p,[id]:!p[id]}));

  // ============================================================
  // HOME
  // ============================================================
  const renderHome = () => {
    
    const todayStr = getTodayJalali();
    const todayInj = getUpcomingInjections(0);
    const next7 = getUpcomingInjections(7).filter(i=>i.daysFromNow>0);
    const todayNote = dailyNotes[todayStr]||null;
    const todayGroups = groupByHormone(todayInj);
    const next7Grouped = groupNext7ByDate(next7);
    
    return (
      <ScrollView style={[styles.scroll,{backgroundColor:t.bg}]} contentContainerStyle={{paddingBottom:90}}>
        {/* 4 باکس آمار */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={[styles.statBox,{backgroundColor:t.primary}]} onPress={()=>setScreen('list')}>
            <Text style={styles.statNum}>{getTotalCount()}</Text><Text style={styles.statLbl}>دام‌ها</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.statBox,{backgroundColor:t.success}]} onPress={()=>setScreen('manage')}>
            <Text style={styles.statNum}>{Object.keys(sectionNames).length}</Text><Text style={styles.statLbl}>جایگاه‌ها</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.statBox,{backgroundColor:t.warning}]} onPress={()=>setScreen('hormone')}>
            <Text style={styles.statNum}>{Object.keys(cattleProtocols).length}</Text><Text style={styles.statLbl}>پروتکل فعال</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.statBox,{backgroundColor:t.info}]} onPress={()=>setScreen('notes')}>
            <Text style={styles.statNum}>{Object.keys(dailyNotes).length}</Text><Text style={styles.statLbl}>یادداشت‌ها</Text>
          </TouchableOpacity>
        </View>

        {/* یادداشت امروز — بلافاصله زیر 4 باکس */}
        {todayNote && (
          
          <View style={[styles.card,{backgroundColor:t.card, marginTop:14}]}>
            <Text style={[styles.cardTitle,{color:t.text}]}>📝 یادداشت امروز</Text>
            <Text style={[styles.noteBody,{color:t.text}]}>{todayNote}</Text>
          </View>
        )}

        {/* تزریق امروز — گروه‌بندی شده به هورمون */}
        <View style={[styles.card,{backgroundColor:t.card, marginTop: todayNote ? 0 : 14}]}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.badge,{backgroundColor: todayInj.length>0 ? t.danger : t.border}]}>
              <Text style={styles.badgeTxt}>{todayInj.length}</Text>
            </View>
            <Text style={[styles.cardTitle,{color:t.text,marginBottom:5}]}> 💉تزریقات امروز</Text>
            <Text style={styles.headerSub}>{getTodayJalali()}</Text>
          </View>
          {todayGroups.length===0 ? (
            <Text style={[styles.emptyTxt,{color:t.textSec}]}>هیچ تزریقی امروز نیست ✓</Text>
          ) : todayGroups.map((grp,gi) => (
            <View key={gi} style={[styles.hormoneBox,{backgroundColor:t.dangerLight, borderColor:t.danger}]}>
              {/* هدر هورمون */}
              <View style={styles.hormoneBoxHeader}>
                <View style={[styles.hormoneBoxBadge,{backgroundColor:t.danger}]}>
                  <Text style={styles.hormoneBoxBadgeTxt}>{grp.items.length} دام</Text>
                </View>
                <Text style={[styles.hormoneBoxTitle,{color:t.danger}]}>💊 {grp.hormoneName} — {grp.dosage}</Text>
              </View>
              {/* شماره دام‌ها */}
              <View style={styles.chipRow}>
                {grp.items.map((inj,ii) => (
                  <TouchableOpacity key={ii} style={[styles.injChip,{backgroundColor:t.card, borderColor:t.danger}]}
                    onPress={()=>markDone(inj.cattleNum, inj.assignmentId, inj.dayOffset)}>
                    <Text style={[styles.injChipDone,{color:t.success}]}>✓</Text>
                    <Text style={[styles.injChipNum,{color:t.text}]}>{inj.cattleNum}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* تا 7 روز آینده — گروه‌بندی به تاریخ سپس هورمون */}
        <View style={[styles.card,{backgroundColor:t.card}]}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.badge,{backgroundColor: next7.length>0 ? t.warning : t.border}]}>
              <Text style={styles.badgeTxt}>{next7.length}</Text>
            </View>
            <Text style={[styles.cardTitle,{color:t.text,marginBottom:0}]}>📅 تا 7 روز آینده</Text>
          </View>
          {next7Grouped.length===0 ? (
            <Text style={[styles.emptyTxt,{color:t.textSec}]}>تزریقی در هفته آینده نیست</Text>
          ) : next7Grouped.map((dg,di) => (
            <View key={di} style={{marginBottom:12}}>
              {/* سر تاریخ */}
              <View style={[styles.datePill,{backgroundColor:t.warningLight}]}>
                <Text style={[styles.datePillTxt,{color:t.warning}]}>📆 {dg.date} — تا {dg.daysFromNow} روز</Text>
              </View>
              {/* گروه‌های هورمون */}
              {dg.groups.map((grp,gi) => (
                <View key={gi} style={[styles.hormoneBox,{backgroundColor:t.warningLight, borderColor:t.warning, marginTop:6}]}>
                  <View style={styles.hormoneBoxHeader}>
                    <View style={[styles.hormoneBoxBadge,{backgroundColor:t.warning}]}>
                      <Text style={styles.hormoneBoxBadgeTxt}>{grp.items.length} دام</Text>
                    </View>
                    <Text style={[styles.hormoneBoxTitle,{color:t.warning}]}>💊 {grp.hormoneName} — {grp.dosage}</Text>
                  </View>
                  <View style={styles.chipRow}>
                    {grp.items.map((inj,ii) => (
                      <View key={ii} style={[styles.injChip,{backgroundColor:t.card, borderColor:t.warning}]}>
                        <Text style={[styles.injChipNum,{color:t.text}]}>{inj.cattleNum}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  // ============================================================
  // CATTLE LIST
  // ============================================================
  const renderCattleList = () => (
    <ScrollView style={[styles.scroll,{backgroundColor:t.bg}]} contentContainerStyle={{paddingBottom:90}}>
      {Object.keys(sectionNames).map(secId => {
        const list = cattleData[secId]||[];
        const isOpen = expandedSections[secId];
        return (
          <View key={secId} style={[styles.sectionCard,{backgroundColor:t.card}]}>
            <View style={[styles.sectionHeaderRow,{backgroundColor:t.primary}]}>
              <TouchableOpacity style={[styles.expandBtn,{backgroundColor:isOpen?t.danger:t.success}]} onPress={()=>toggleSection(secId)}>
                <Text style={styles.expandBtnTxt}>{isOpen ? '▲ بستن' : `نمایش لیست (${list.length})`}</Text>
              </TouchableOpacity>
              <Text style={styles.sectionHeaderTitle}>{sectionNames[secId]}</Text>
            </View>
            {isOpen && (
              <View style={styles.cattleGrid}>
                {list.length===0 ? (
                  <Text style={[styles.emptyTxt,{color:t.textSec,width:'100%'}]}>دامی در این جایگاه نیست</Text>
                ) : list.map(num => {
                  const hasP = !!cattleProtocols[num] && cattleProtocols[num].length>0;
                  return (
                    <TouchableOpacity key={num} style={[styles.cattleChip,{backgroundColor:hasP?t.primary:t.cardAlt, borderColor:hasP?t.primary:t.border}]}
                      onPress={()=>deleteCattle(num,secId)}>
                      {hasP && <Text style={styles.cattleChipDot}>💉</Text>}
                      <Text style={[styles.cattleChipNum,{color:hasP?'#fff':t.text}]}>{num}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      {deletedCattle.length>0 && (
        <View style={[styles.card,{backgroundColor:t.card}]}>
          <Text style={[styles.cardTitle,{color:t.danger}]}>🗑️ حذف شده ({deletedCattle.length})</Text>
          <View style={styles.cattleGrid}>
            {deletedCattle.map((item,i) => (
              <View key={i} style={[styles.cattleChip,{backgroundColor:t.dangerLight, borderColor:t.danger}]}>
                <Text style={[styles.cattleChipNum,{color:t.danger}]}>{item.num||item}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );

  // ============================================================
  // HORMONE
  // ============================================================
  const renderHormone = () => {
    const protoList = Object.keys(protocols);
    return (
      <ScrollView style={[styles.scroll,{backgroundColor:t.bg}]} contentContainerStyle={{paddingBottom:90}}>
        {/* تعریف پروتکل */}
        <View style={[styles.card,{backgroundColor:t.card}]}>
          <Text style={[styles.cardTitle,{color:t.text}]}>📋 تعریف پروتکل جدید</Text>
          <TextInput style={[styles.input,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]}
            placeholder="نام پروتکل (مثال:)" placeholderTextColor={t.textSec}
            value={newProtocolName} onChangeText={setNewProtocolName} />
          <TouchableOpacity style={[styles.btn,{backgroundColor:t.primary}]} onPress={createProtocol}>
            <Text style={styles.btnTxt}>+ ایجاد پروتکل</Text>
          </TouchableOpacity>
        </View>

        {/* لیست پروتکل‌ها */}
        {protoList.length>0 && (
          <View style={[styles.card,{backgroundColor:t.card}]}>
            <Text style={[styles.cardTitle,{color:t.text}]}>📂 پروتکل‌های تعریف شده</Text>
            {protoList.map(pid => {
              const p = protocols[pid];
              const isEd = editingProtocol && editingProtocol.id===pid;
              return (
                <View key={pid}>
                  <View style={[styles.protoRow,{backgroundColor:isEd?t.primaryLight:t.cardAlt, borderColor:isEd?t.primary:t.border}]}>
                    <TouchableOpacity onPress={()=>deleteProtocol(pid)}><Text style={{color:t.danger,fontSize:18}}>🗑️</Text></TouchableOpacity>
                    <TouchableOpacity style={{flex:1}} onPress={()=>setEditingProtocol(isEd?null:{id:pid,name:p.name,steps:p.steps})}>
                      <Text style={[styles.protoName,{color:t.text}]}>{p.name}</Text>
                      <Text style={[styles.protoSteps,{color:t.textSec}]}>{p.steps.length} مرحله</Text>
                    </TouchableOpacity>
                  </View>
                  {isEd && (
                    <View style={[styles.editPanel,{backgroundColor:t.cardAlt, borderColor:t.border}]}>
                      {editingProtocol.steps.map(s => (
                        <View key={s.dayOffset} style={[styles.stepRow,{borderBottomColor:t.border}]}>
                          <TouchableOpacity onPress={()=>removeStepFromProtocol(s.dayOffset)}><Text style={{color:t.danger,fontSize:18}}>✕</Text></TouchableOpacity>
                          <View style={{flex:1,alignItems:'flex-end'}}>
                            <Text style={[styles.stepDay,{color:t.primary}]}>روز {s.dayOffset}</Text>
                            <Text style={[styles.stepInfo,{color:t.text}]}>{s.hormoneName} — {s.dosage}</Text>
                            {s.note ? <Text style={[styles.stepNote,{color:t.textSec}]}>{s.note}</Text> : null}
                          </View>
                        </View>
                      ))}
                      <Text style={[styles.subLabel,{color:t.textSec,marginTop:14}]}>+ اضافه مرحله جدید</Text>
                      <View style={styles.stepFormRow}>
                        <TextInput style={[styles.stepInput,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border,flex:2}]} placeholder="نام هورمون" placeholderTextColor={t.textSec} value={newStepHormone} onChangeText={setNewStepHormone} />
                        <TextInput style={[styles.stepInput,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border,flex:1}]} placeholder="روز" placeholderTextColor={t.textSec} value={newStepDay} onChangeText={setNewStepDay} keyboardType="numeric" />
                      </View>
                      <View style={styles.stepFormRow}>
                        <TextInput style={[styles.stepInput,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border,flex:2}]} placeholder="توضیحات" placeholderTextColor={t.textSec} value={newStepNote} onChangeText={setNewStepNote} />
                        <TextInput style={[styles.stepInput,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border,flex:1}]} placeholder="دوز" placeholderTextColor={t.textSec} value={newStepDosage} onChangeText={setNewStepDosage} />
                      </View>
                      <TouchableOpacity style={[styles.btn,{backgroundColor:t.success}]} onPress={addStepToProtocol}>
                        <Text style={styles.btnTxt}>+ اضافه مرحله</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* تخصیص پروتکل */}
        <View style={[styles.card,{backgroundColor:t.card}]}>
          <Text style={[styles.cardTitle,{color:t.text}]}>🐄 تخصیص پروتکل به دام</Text>
          <Text style={[styles.inputLabel,{color:t.textSec}]}>شماره دام:</Text>
          <TextInput style={[styles.input,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]} placeholder="مثال: 1234" placeholderTextColor={t.textSec} value={assignCattleNum} onChangeText={setAssignCattleNum} keyboardType="numeric" />
          <Text style={[styles.inputLabel,{color:t.textSec}]}>انتخاب پروتکل:</Text>
          <View style={{marginBottom:12}}>
            {protoList.length===0 ? <Text style={[styles.emptyTxt,{color:t.textSec}]}>پروتکلی تعریف نشده</Text> :
              protoList.map(pid => (
                <TouchableOpacity key={pid} style={[styles.pickerItem,{backgroundColor:assignProtocolId===pid?t.primary:t.cardAlt, borderColor:assignProtocolId===pid?t.primary:t.border}]} onPress={()=>setAssignProtocolId(pid)}>
                  <Text style={[styles.pickerTxt,{color:assignProtocolId===pid?'#fff':t.text}]}>{protocols[pid].name} ({protocols[pid].steps.length} مرحله)</Text>
                </TouchableOpacity>
              ))
            }
          </View>
          <Text style={[styles.inputLabel,{color:t.textSec}]}>تاریخ شروع شمسی (روز صفر):</Text>
          <TextInput style={[styles.input,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]} placeholder="1404/01/15" placeholderTextColor={t.textSec} value={assignStartDate} onChangeText={setAssignStartDate} />
          <TouchableOpacity style={[styles.btn,{backgroundColor:t.success}]} onPress={assignProtocol}>
            <Text style={styles.btnTxt}>✓ تخصیص پروتکل</Text>
          </TouchableOpacity>
        </View>

        {/* دام‌های فعال */}
        <View style={[styles.card,{backgroundColor:t.card}]}>
          <Text style={[styles.cardTitle,{color:t.text}]}>📈 دام‌های فعال</Text>
          {Object.keys(cattleProtocols).length===0 ? (
            <Text style={[styles.emptyTxt,{color:t.textSec}]}>دامی با پروتکل فعال نیست</Text>
          ) : Object.keys(cattleProtocols).map(num =>
            cattleProtocols[num].map(a => {
              const pending = a.steps.filter(s=>!s.done);
              const done = a.steps.filter(s=>s.done);
              const pct = a.steps.length>0 ? Math.round((done.length/a.steps.length)*100) : 100;
              const fin = pending.length===0;
              return (
                <View key={a.id} style={[styles.activeCattleCard,{backgroundColor:t.cardAlt, borderColor:fin?t.success:t.primary}]}>
                  <View style={styles.activeCattleHeader}>
                    <View style={[styles.pctBadge,{backgroundColor:fin?t.success:t.primary}]}>
                      <Text style={styles.pctBadgeTxt}>{pct}%</Text>
                    </View>
                    <Text style={[styles.activeCattleName,{color:t.text}]}>🐄 دام {num}</Text>
                  </View>
                  <Text style={[styles.activeCattleProto,{color:t.textSec}]}>پروتکل: {a.protocolName} | شروع: {a.startDate}</Text>
                  <View style={[styles.progressBg,{backgroundColor:t.border}]}>
                    <View style={[styles.progressFill,{width:`${pct}%`, backgroundColor:fin?t.success:t.primary}]} />
                  </View>
                  {pending.map(s => (
                    <View key={s.dayOffset} style={[styles.pendingStep,{borderRightColor:t.primary, backgroundColor:t.card}]}>
                      <TouchableOpacity style={[styles.markDoneSmall,{backgroundColor:t.success}]} onPress={()=>markDone(num,a.id,s.dayOffset)}>
                        <Text style={styles.markDoneSmallTxt}>✓</Text>
                      </TouchableOpacity>
                      <View style={{flex:1,alignItems:'flex-end'}}>
                        <Text style={[styles.pendingStepDay,{color:t.primary}]}>روز {s.dayOffset} — {s.injectionDate}</Text>
                        <Text style={[styles.pendingStepInfo,{color:t.text}]}>{s.hormoneName} — {s.dosage}</Text>
                      </View>
                    </View>
                  ))}
                  {done.length>0 && <Text style={[styles.doneCount,{color:t.textSec}]}>{done.length} مرحله انجام شده</Text>}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  // ============================================================
  // MANAGE
  // ============================================================
  const renderManage = () => (
    <ScrollView style={[styles.scroll,{backgroundColor:t.bg}]} contentContainerStyle={{paddingBottom:90}}>
      <View style={[styles.card,{backgroundColor:t.card}]}>
        <Text style={[styles.cardTitle,{color:t.text}]}>🔍 جستجوی دام</Text>
        <TextInput style={[styles.input,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]} placeholder="شماره دام" placeholderTextColor={t.textSec} value={searchNumber} onChangeText={setSearchNumber} keyboardType="numeric" />
        <TouchableOpacity style={[styles.btn,{backgroundColor:t.primary}]} onPress={searchCattle}><Text style={styles.btnTxt}>جستجو</Text></TouchableOpacity>
        {searchResult && (
          <View style={[styles.searchBox,{backgroundColor:searchResult.found?t.successLight:t.dangerLight}]}>
            <Text style={[styles.searchTxt,{color:searchResult.found?t.success:t.danger}]}>
              {searchResult.found ? `✓ دام ${searchResult.num} در "${sectionNames[searchResult.section]}" است` : `✗ دام ${searchResult.num} یافت نشد`}
            </Text>
          </View>
        )}
      </View>
      <View style={[styles.card,{backgroundColor:t.card}]}>
        <Text style={[styles.cardTitle,{color:t.text}]}>➕ افزودن دام جدید</Text>
        <TextInput style={[styles.input,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]} placeholder="شماره دام" placeholderTextColor={t.textSec} value={cattleNumber} onChangeText={setCattleNumber} keyboardType="numeric" />
        <Text style={[styles.inputLabel,{color:t.textSec}]}>جایگاه:</Text>
        <View style={{marginBottom:12}}>
          {Object.keys(sectionNames).map(id => (
            <TouchableOpacity key={id} style={[styles.pickerItem,{backgroundColor:selectedSection===id?t.primary:t.cardAlt, borderColor:selectedSection===id?t.primary:t.border}]} onPress={()=>setSelectedSection(id)}>
              <Text style={[styles.pickerTxt,{color:selectedSection===id?'#fff':t.text}]}>{sectionNames[id]} ({(cattleData[id]||[]).length})</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[styles.btn,{backgroundColor:t.success}]} onPress={addCattle}><Text style={styles.btnTxt}>✓ افزودن دام</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btn,{backgroundColor:t.primary}]} onPress={()=>setShowNewSectionModal(true)}><Text style={styles.btnTxt}>+ جایگاه جدید</Text></TouchableOpacity>
      </View>
      
      <View style={[styles.card,{backgroundColor:t.card}]}>
        <Text style={[styles.cardTitle,{color:t.text}]}>🔄 انتقال دام</Text>
        <TextInput style={[styles.input,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]} placeholder="شماره دام" placeholderTextColor={t.textSec} value={transferNumber} onChangeText={setTransferNumber} keyboardType="numeric" />
        <Text style={[styles.inputLabel,{color:t.textSec}]}>به جایگاه:</Text>
        <View style={{marginBottom:12}}>
          {Object.keys(sectionNames).map(id => (
            <TouchableOpacity key={id} style={[styles.pickerItem,{backgroundColor:transferToSection===id?t.primary:t.cardAlt, borderColor:transferToSection===id?t.primary:t.border}]} onPress={()=>setTransferToSection(id)}>
              <Text style={[styles.pickerTxt,{color:transferToSection===id?'#fff':t.text}]}>{sectionNames[id]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[styles.btn,{backgroundColor:t.warning}]} onPress={transferCattle}><Text style={styles.btnTxt}>انتقال دام</Text></TouchableOpacity>
      </View>
      <View style={[styles.card,{backgroundColor:t.card}]}>
        <Text style={[styles.cardTitle,{color:t.text}]}>🏢 مدیریت جایگاه‌ها</Text>
        {Object.keys(sectionNames).map(id => (
          <View key={id} style={[styles.secManageRow,{borderBottomColor:t.border}]}>
            {id!=='default' && <TouchableOpacity style={[styles.smallBtn,{backgroundColor:t.danger}]} onPress={()=>deleteSection(id)}><Text style={styles.smallBtnTxt}>حذف</Text></TouchableOpacity>}
            <View style={{flex:1,alignItems:'flex-end'}}>
              <Text style={[styles.secManageName,{color:t.text}]}>{sectionNames[id]}</Text>
              <Text style={[styles.secManageCount,{color:t.textSec}]}>{(cattleData[id]||[]).length} دام</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  // ============================================================
  // NOTES
  // ============================================================
  const renderNotes = () => (
    <ScrollView style={[styles.scroll,{backgroundColor:t.bg}]} contentContainerStyle={{paddingBottom:90}}>
      <View style={[styles.card,{backgroundColor:t.card}]}>
        <Text style={[styles.cardTitle,{color:t.text}]}>📝 یادداشت جدید</Text>
        <Text style={[styles.inputLabel,{color:t.textSec}]}>تاریخ (شمسی):</Text>
        <TextInput style={[styles.input,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]} placeholder="1404/01/15" placeholderTextColor={t.textSec} value={notesDate} onChangeText={setNotesDate} />
        <Text style={[styles.inputLabel,{color:t.textSec}]}>متن:</Text>
        <TextInput style={[styles.input,styles.textArea,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]} placeholder="یادداشت را وارد کنید..." placeholderTextColor={t.textSec} value={notesText} onChangeText={setNotesText} multiline />
        <TouchableOpacity style={[styles.btn,{backgroundColor:t.success}]} onPress={saveDailyNote}><Text style={styles.btnTxt}>✓ ذخیره یادداشت</Text></TouchableOpacity>
      </View>
      <View style={[styles.card,{backgroundColor:t.card}]}>
        <Text style={[styles.cardTitle,{color:t.text}]}>📚 یادداشت‌های ثبت شده ({Object.keys(dailyNotes).length})</Text>
        {Object.keys(dailyNotes).sort((a,b)=>jalaliCompare(b,a)).map(date => (
          <View key={date} style={[styles.noteItem,{backgroundColor:t.cardAlt}]}>
            <View style={styles.noteHeader}>
              <TouchableOpacity onPress={()=>deleteNote(date)}><Text style={{color:t.danger,fontSize:18}}>🗑️</Text></TouchableOpacity>
              <Text style={[styles.noteDate,{color:t.text}]}>📅 {date}</Text>
            </View>
            <Text style={[styles.noteBody,{color:t.text}]}>{dailyNotes[date]}</Text>
          </View>
        ))}
        {Object.keys(dailyNotes).length===0 && <Text style={[styles.emptyTxt,{color:t.textSec}]}>یادداشتی ثبت نشده</Text>}
      </View>
    </ScrollView>
  );

  // ============================================================
  // SETTINGS
  // ============================================================
  const renderSettings = () => (
    <ScrollView style={[styles.scroll,{backgroundColor:t.bg}]} contentContainerStyle={{paddingBottom:90}}>
      <View style={[styles.card,{backgroundColor:t.card}]}>
        <Text style={[styles.cardTitle,{color:t.text}]}>⚙️ تنظیمات</Text>
        <View style={styles.settingRow}>
          <Switch value={isDarkMode} onValueChange={setIsDarkMode} trackColor={{false:t.border,true:t.primary}} thumbColor="#fff" />
          <View style={{flex:1,alignItems:'flex-end'}}>
            <Text style={[styles.settingTitle,{color:t.text}]}>حالت تاریک</Text>
            <Text style={[styles.settingDesc,{color:t.textSec}]}>فعال/غیرفعال تم تیره</Text>
          </View>
        </View>
      </View>

      {/* بک آپ */}
      <View style={[styles.card,{backgroundColor:t.card}]}>
        <Text style={[styles.cardTitle,{color:t.text}]}>💾 بک آپ داده‌ها</Text>
        <Text style={[styles.backupDesc,{color:t.textSec}]}>
          می‌توانید داده‌های کامل برنامه را به عنوان فایل JSON بک آپ گیری کنید و بعداً دوباره وارد کنید.
        </Text>
        <TouchableOpacity style={[styles.btn,{backgroundColor:t.primary}]} onPress={exportBackup}>
          <Text style={styles.btnTxt}>📤بک آپ گرفتن</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn,{backgroundColor:t.warning}]} onPress={importBackup}>
          <Text style={styles.btnTxt}>📥 وارد کردن بک آپ</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, {backgroundColor: t.card}]}>
        <Text style={[styles.cardTitle, {color: t.text}]}>ℹ️ درباره</Text>
        
        {/* توضیحات درباره اپ */}
        <View style={styles.aboutRow}>
          <Text style={[styles.aboutDesc, {color: t.textSec, textAlign: 'right', lineHeight: 24}]}>
            دام‌یار یک راهکار جامع مدیریت تزریقات هورمونی و جایگاه‌های گاوداری است که با ثبت هوشمند، برنامه‌ریزی دقیق و گزارش‌گیری آنی، به دامداران کمک می‌کند تا سلامت گله را بهبود بخشیده و بازدهی اقتصادی را افزایش دهند.
          </Text>
        </View>
        
        {/* ردیف نسخه */}
        <View style={styles.aboutRow}>

          <Text style={[styles.aboutVal, { color: t.text }]}>2.1.0</Text>
          <Text style={[styles.aboutLabel, { color: t.textSec }]}>نسخه</Text>
          
        </View>
        
        
      </View>
    </ScrollView>
  );

  // ---- SWITCH ----
  const renderScreen = () => {
    switch(screen){
      case 'home': return renderHome();
      case 'list': return renderCattleList();
      case 'hormone': return renderHormone();
      case 'manage': return renderManage();
      case 'notes': return renderNotes();
      case 'settings': return renderSettings();
      default: return renderHome();
    }
  };

  const screenTitle = {home:'خانه',list:'لیست دام‌ها',hormone:'هورمون تراپی',manage:'مدیریت دام',notes:'یادداشت‌ها',settings:'تنظیمات'};

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <SafeAreaView style={[styles.root,{backgroundColor:t.headerBg}]}>
      <StatusBar barStyle="light-content" backgroundColor={t.headerBg} />

      {/* هدر — دکمه تنظیمات سمت چپ صفحه */}
      <View style={[styles.header,{backgroundColor:t.headerBg}]}>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>FarmHand</Text>
          
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={()=>setScreen('settings')}>
          <Text style={styles.settingsBtnIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* محتوا */}
      <View style={[styles.contentWrap,{backgroundColor:t.bg}]}>
        {renderScreen()}
      </View>

      {/* نافیگیشن پایین — 5 آیتم، بدون تنظیمات */}
      <View style={[styles.navbar,{backgroundColor:t.navBg, borderTopColor:t.border}]}>
        {[
          {key:'notes',icon:'📝',label:'یادداشت'},
          {key:'hormone',icon:'💉',label:'هورمون'},
          {key:'list',icon:'📋',label:'لیست'},
          {key:'manage',icon:'🗃️',label:'مدیریت'},
          {key:'home',icon:'🏠',label:'خانه'},
       
        ].map(item => (
          <TouchableOpacity key={item.key} style={styles.navItem} onPress={()=>setScreen(item.key)}>
            <Text style={[styles.navIcon,{opacity:screen===item.key?1:0.45}]}>{item.icon}</Text>
            <Text style={[styles.navLabel,{color:screen===item.key?t.primary:t.textSec}]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* مودال جایگاه جدید */}
      <Modal visible={showNewSectionModal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.modalBox,{backgroundColor:t.card}]}>
            <Text style={[styles.modalTitle,{color:t.text}]}>جایگاه جدید</Text>
            <TextInput style={[styles.input,{backgroundColor:t.inputBg,color:t.text,borderColor:t.border}]} placeholder="نام جایگاه" placeholderTextColor={t.textSec} value={newSectionName} onChangeText={setNewSectionName} autoFocus />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn,{backgroundColor:t.danger}]} onPress={()=>{setShowNewSectionModal(false);setNewSectionName('');}}>
                <Text style={styles.btnTxt}>انصراف</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn,{backgroundColor:t.success}]} onPress={addNewSection}>
                <Text style={styles.btnTxt}>ایجاد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================
// STYLES — کامل راست‌چین
// ============================================================
const styles = StyleSheet.create({
  root: { flex: 1 },

  // هدر
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',          // چپ به راست
    alignItems: 'flex-end',
  },
  headerCenter: {  flex: 1,  alignItems: 'center'},
  headerTitle: {  fontSize: 20,  fontWeight: 'bold', color: '#fff',  marginBottom: 2, atextAlign: 'right',alignSelf: 'stretch', paddingHorizontal: 6,paddingVertical: 4},
  headerSub: { fontSize: 13,  color: 'rgba(255,255,255,0.8)',alignSelf: 'center'  },
   

  // دکمه تنظیمات — سمت چپ صفحه (اول در flexDirection:'row')
  settingsBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  settingsBtnIcon: { fontSize: 24 },

  contentWrap: { flex: 1 },
  scroll: { flex: 1 },

  // آمار
  statsRow: { flexDirection:'row', flexWrap:'wrap', paddingHorizontal:18, paddingTop:12, gap:10 },
  statBox: { width:(width-46)/2, borderRadius:14, padding:16, alignItems:'center' },
  statNum: { fontSize:28, fontWeight:'bold', color:'#fff' },
  statLbl: { fontSize:11, color:'rgba(255,255,255,0.9)', marginTop:3 },

  // کارت
  card: { margin:12, marginTop:0, borderRadius:14, padding:18, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:6, elevation:3 },
  cardTitleRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  cardTitle: { fontSize:17, fontWeight:'bold', textAlign:'right', marginBottom:12 },
  badge: { paddingHorizontal:10, paddingVertical:3, borderRadius:10 },
  badgeTxt: { color:'#fff', fontSize:12, fontWeight:'bold' },

  // فرم
  inputLabel: { fontSize:13, fontWeight:'600', textAlign:'right', marginBottom:6, marginTop:2 },
  input: { borderWidth:1.5, borderRadius:10, padding:12, fontSize:15, marginBottom:12, textAlign:'right' },
  textArea: { height:100, textAlignVertical:'top' },

  // دکمه‌ها
  btn: { padding:14, borderRadius:10, alignItems:'center', marginBottom:8 },
  btnTxt: { color:'#fff', fontSize:15, fontWeight:'bold' },
  smallBtn: { paddingHorizontal:14, paddingVertical:7, borderRadius:8 },
  smallBtnTxt: { color:'#fff', fontSize:13, fontWeight:'bold' },

  pickerItem: { padding:13, borderRadius:10, marginBottom:7, borderWidth:1.5 },
  pickerTxt: { fontSize:14, textAlign:'right' },
  emptyTxt: { fontSize:14, textAlign:'center', padding:12 },

  // باکس هورمون (خانه)
  hormoneBox: { borderWidth:1.5, borderRadius:12, padding:12, marginBottom:10 },
  hormoneBoxHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  hormoneBoxTitle: { fontSize:15, fontWeight:'bold', textAlign:'right' },
  hormoneBoxBadge: { paddingHorizontal:10, paddingVertical:3, borderRadius:10 },
  hormoneBoxBadgeTxt: { color:'#fff', fontSize:12, fontWeight:'bold' },

  // چیپ دام
  chipRow: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  injChip: { borderWidth:1.5, borderRadius:10, paddingHorizontal:14, paddingVertical:8, flexDirection:'row', alignItems:'center', gap:6 },
  injChipNum: { fontSize:15, fontWeight:'bold' },
  injChipDone: { fontSize:14, fontWeight:'bold' },

  // پیل تاریخ
  datePill: { paddingHorizontal:12, paddingVertical:6, borderRadius:8, marginBottom:2 },
  datePillTxt: { fontSize:13, fontWeight:'bold', textAlign:'right' },

  // یادداشت
  noteItem: { borderRadius:10, padding:14, marginBottom:8 },
  noteHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  noteDate: { fontSize:14, fontWeight:'bold' },
  noteBody: { fontSize:14, lineHeight:22, textAlign:'right' },

  // لیست دام
  sectionCard: { margin:12, marginTop:7, borderRadius:14, overflow:'hidden', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:6, elevation:3 },
  sectionHeaderRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:14 },
  sectionHeaderTitle: { fontSize:16, fontWeight:'bold', color:'#fff' },
  expandBtn: { paddingHorizontal:14, paddingVertical:7, borderRadius:8 },
  expandBtnTxt: { color:'#fff', fontSize:13, fontWeight:'bold' },
  cattleGrid: { flexDirection:'row', flexWrap:'wrap', padding:10, gap:8 },
  cattleChip: { paddingHorizontal:14, paddingVertical:10, borderRadius:10, borderWidth:1.5, flexDirection:'row', alignItems:'center', gap:5 },
  cattleChipNum: { fontSize:15, fontWeight:'bold' },
  cattleChipDot: { fontSize:12 },

  // پروتکل
  protoRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:13, borderRadius:10, borderWidth:1.5, marginBottom:8 },
  protoName: { fontSize:15, fontWeight:'bold', textAlign:'right' },
  protoSteps: { fontSize:12, textAlign:'right', marginTop:2 },
  editPanel: { borderWidth:1.5, borderRadius:10, padding:14, marginBottom:12, marginTop:-4 },
  stepRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', paddingVertical:10, borderBottomWidth:1 },
  stepDay: { fontSize:14, fontWeight:'bold', textAlign:'right' },
  stepInfo: { fontSize:13, marginTop:2, textAlign:'right' },
  stepNote: { fontSize:12, marginTop:2, fontStyle:'italic', textAlign:'right' },
  subLabel: { fontSize:13, fontWeight:'600', textAlign:'right', marginBottom:8 },
  stepFormRow: { flexDirection:'row', gap:8, marginBottom:8 },
  stepInput: { borderWidth:1.5, borderRadius:8, padding:10, fontSize:14, textAlign:'right' },

  // دام فعال
  activeCattleCard: { borderWidth:2, borderRadius:12, padding:14, marginBottom:10 },
  activeCattleHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  activeCattleName: { fontSize:16, fontWeight:'bold', textAlign:'right' },
  activeCattleProto: { fontSize:12, marginTop:3, textAlign:'right' },
  pctBadge: { paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  pctBadgeTxt: { color:'#fff', fontSize:13, fontWeight:'bold' },
  progressBg: { height:6, borderRadius:3, marginTop:10, marginBottom:10 },
  progressFill: { height:6, borderRadius:3 },
  pendingStep: { borderRightWidth:3, borderRadius:8, padding:10, marginBottom:6, flexDirection:'row', alignItems:'center' },
  pendingStepDay: { fontSize:13, fontWeight:'bold', textAlign:'right' },
  pendingStepInfo: { fontSize:13, marginTop:2, textAlign:'right' },
  markDoneSmall: { paddingHorizontal:10, paddingVertical:6, borderRadius:6 },
  markDoneSmallTxt: { color:'#fff', fontSize:14, fontWeight:'bold' },
  doneCount: { fontSize:12, textAlign:'right', marginTop:4 },

  // جستجو
  searchBox: { borderRadius:10, padding:12, marginTop:8 },
  searchTxt: { fontSize:14, textAlign:'right', fontWeight:'600' },

  // مدیریت جایگاه
  secManageRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:12, borderBottomWidth:1 },
  secManageName: { fontSize:15, fontWeight:'bold', textAlign:'right' },
  secManageCount: { fontSize:13, marginTop:2, textAlign:'right' },

  // تنظیمات
  settingRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10 },
  settingTitle: { fontSize:15, fontWeight:'bold', textAlign:'right' },
  settingDesc: { fontSize:13, marginTop:2, textAlign:'right' },
  backupDesc: { fontSize:13, textAlign:'right', lineHeight:20, marginBottom:14 },
  aboutRow: { flexDirection:'row', justifyContent:'space-between', paddingVertical:10 },
  aboutLabel: { fontSize:14 },
  aboutVal: { fontSize:14, fontWeight:'bold' },

  // ناویگیشن
  navbar: { flexDirection:'row',marginBottom:13, borderTopWidth:1, paddingVertical:6, paddingBottom: Platform.OS==='ios'?20:6 },
  navItem: { flex:1, alignItems:'center', paddingVertical:4 },
  navIcon: { fontSize:25 },
  navLabel: { fontSize:15, fontWeight:'600', marginTop:2 },

  // مودال
  modalBg: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center', padding:24 },
  modalBox: { width:'100%', borderRadius:18, padding:24 },
  modalTitle: { fontSize:19, fontWeight:'bold', textAlign:'center', marginBottom:18 },
  modalBtns: { flexDirection:'row', gap:10, marginTop:8 },
  modalBtn: { flex:1, padding:14, borderRadius:10, alignItems:'center' },
});