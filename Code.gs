/**
 * Google Apps Script — รับรายงานประจำสัปดาห์จากเว็บแอป แล้วบันทึกลง Google Sheet
 *
 * รูปแบบข้อมูล: 1 รายการ = 1 แถว
 *  - แต่ละคนมีแท็บของตัวเอง (ชื่อแท็บ = ชื่อพนักงาน)
 *  - ทุกแถวมี เวลาส่ง / วันที่เริ่มต้น / วันที่สิ้นสุด (จันทร์-ศุกร์) / ชื่อ กำกับเสมอ
 *  - ส่งรายงานครั้งใหม่ ระบบจะเขียนต่อท้ายแถวเดิม (ไม่ลบของเก่า)
 *  - ถ้าเครือข่ายหลุดแล้วกดส่งซ้ำ รหัสการส่ง (sid) เดียวกันจะไม่ถูกบันทึกซ้ำ
 *
 * วิธีใช้: เปิด Google Sheet → Extensions → Apps Script → วางโค้ดนี้ → Deploy เป็น Web app
 */

const ALLOWED_USERS = ['ທ ກູ່ຄຳ','ທ ເຂັມຄຳ','ທ ຄຳສອນ','ທ ຄຳປະດິດ','ທ ແກ້ວອຸດອນ','ນ ຄູນ','ນ ບຸນຊູ','ນ ອາລິດສະລາ','ທ ເລ່ເມີ້ນ','ທ ພອນທະວີ'];

const HEADERS = [
  'ເວລາສົ່ງ (Timestamp)', 'ວັນທີເລີ່ມຕົ້ນ (Start)', 'ວັນທີສິ້ນສຸດ (End)', 'ຊື່ (Name)',
  'ໝວດ (Category)', 'ຊື່ວຽກ / ໂຄງການ', 'ລາຍລະອຽດ / ຄວາມຄືບໜ້າ', 'ລຳດັບຄວາມສຳຄັນ', 'ລະຫັດການສົ່ງ (Submit ID)'
];
const COL_COUNT = HEADERS.length;   // 9 คอลัมน์: A เวลา, B เริ่ม, C สิ้นสุด, D ชื่อ, E หมวด, F ชื่องาน, G รายละเอียด, H ความสำคัญ, I รหัสส่ง
const SID_COL = 9;

// key ใน payload → ชื่อหมวด, ฟิลด์ชื่องาน, ฟิลด์รายละเอียด
const CATEGORIES = [
  { key: 'done',       label: '1. ຜົນງານສຳເລັດ',   title: 't', detail: 'd' },
  { key: 'next',       label: '2. ແຜນອາທິດຕໍ່ໄປ',  title: 't', detail: 'd', priority: 'pr' },
  { key: 'highlights', label: '3. ຈຸດເດັ່ນ',        title: null, detail: 'd' },
  { key: 'problems',   label: '4. ບັນຫາ/ອຸປະສັກ',   title: null, detail: 'd' },
  { key: 'proposals',  label: '5. ຂໍ້ສະເໜີ',        title: null, detail: 'd' }
];
const PRIORITY_LABEL = { high: 'ສູງ', mid: 'ກາງ', low: 'ຕ່ຳ' };

function doGet() {
  return out_({ ok: true, message: 'Weekly report endpoint is running' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);

    if (ALLOWED_USERS.indexOf(d.name) < 0) return out_({ ok: false, error: 'unknown user' });
    const st = parseDate_(d.start), en = parseDate_(d.end);
    if (!st || !en) return out_({ ok: false, error: 'invalid date' });
    const days = (Date.UTC(en.y, en.m - 1, en.d) - Date.UTC(st.y, st.m - 1, st.d)) / 86400000;
    if (days < 0 || days > 31) return out_({ ok: false, error: 'invalid period' });
    const sid = String(d.sid || '').slice(0, 64);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(d.name);
    if (!sh) {
      sh = ss.insertSheet(d.name);
      sh.appendRow(HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, COL_COUNT).setFontWeight('bold').setBackground('#d9f0ed');
      sh.setColumnWidths(1, 4, 120);
      sh.setColumnWidth(5, 150);
      sh.setColumnWidths(6, 2, 340);
      sh.setColumnWidths(8, 2, 120);
    }

    const last = sh.getLastRow();

    // กันบันทึกซ้ำ: ถ้ารหัสการส่งนี้เคยบันทึกแล้ว ถือว่าสำเร็จ
    if (sid && last > 1) {
      const hit = sh.getRange(2, SID_COL, last - 1, 1).createTextFinder(sid).matchEntireCell(true).findNext();
      if (hit) return out_({ ok: true, duplicate: true });
    }

    const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    const rows = [];
    CATEGORIES.forEach(function (cat) {
      const list = Array.isArray(d[cat.key]) ? d[cat.key] : [];
      list.forEach(function (it) {
        const title = cat.title ? String(it[cat.title] || '').trim() : '';
        const detail = String(it[cat.detail] || '').trim();
        if (!title && !detail) return;
        const pr = cat.priority ? (PRIORITY_LABEL[it[cat.priority]] || '') : '';
        rows.push([stamp, dateFormula_(st), dateFormula_(en), d.name, cat.label, title, detail, pr, sid]);
      });
    });
    if (!rows.length) return out_({ ok: false, error: 'no data' });

    const start = last + 1;
    sh.getRange(start, 1, rows.length, COL_COUNT).setValues(rows);
    sh.getRange(start, 2, rows.length, 2).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('left');
    sh.getRange(start, 1, rows.length, COL_COUNT).setWrap(true).setVerticalAlignment('top');
    return out_({ ok: true, rows: rows.length, start: start });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/** รับ {d,m,y} ตรวจว่าเป็นวันที่จริง (เช่น 31 ก.พ. ใช้ไม่ได้) */
function parseDate_(o) {
  if (!o) return null;
  const y = Number(o.y), m = Number(o.m), dd = Number(o.d);
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && dd >= 1 && dd <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, dd));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== dd) return null;
  return { y: y, m: m, d: dd };
}

/** เขียนเป็นสูตร =DATE(ปี,เดือน,วัน) เพื่อให้ได้ "วันที่จริง" ใน Sheet โดยไม่ผิดวันเพราะเขตเวลา */
function dateFormula_(o) {
  return '=DATE(' + o.y + ',' + o.m + ',' + o.d + ')';
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
