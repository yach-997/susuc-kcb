/**
 * Bookmarklet 源码（开发/说明用）。
 * 正式部署后请把 TARGET 改成你的 GitHub Pages 地址。
 *
 * 当前为「模拟数据」模式：不解析页面，直接生成示例课表并跳转。
 * 拿到真实正方课表 HTML 后，把 extractCourses() 换成表格解析即可。
 */
export const BOOKMARKLET_TARGET_PLACEHOLDER =
  'https://YOUR_USERNAME.github.io/cursor-kcb/'

export function buildBookmarkletSource(targetBase: string): string {
  const base = targetBase.replace(/\/$/, '')
  const target = `${base}/#/import`

  // 用数组拼接，避免模板字符串与正则转义冲突
  const lines = [
    '(function(){',
    `var TARGET=${JSON.stringify(target)};`,
    'function b64url(str){',
    'var b64=btoa(unescape(encodeURIComponent(str)));',
    "return b64.replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');",
    '}',
    'function parseParity(w){',
    "if(/单/.test(w)) return 'odd';",
    "if(/双/.test(w)) return 'even';",
    "return 'all';",
    '}',
    'function extractCourses(){',
    'return [',
    "{name:'高等数学A',teacher:'张老师',room:'一教A301',weekday:1,startSection:1,endSection:2,weeks:'1-16'},",
    "{name:'大学英语',teacher:'李老师',room:'外语楼203',weekday:1,startSection:3,endSection:4,weeks:'1-16'},",
    "{name:'程序设计基础',teacher:'王老师',room:'实验楼B105',weekday:2,startSection:1,endSection:2,weeks:'1-16'},",
    "{name:'线性代数',teacher:'赵老师',room:'一教B201',weekday:2,startSection:5,endSection:6,weeks:'1-8单'},",
    "{name:'体育（篮球）',teacher:'陈老师',room:'体育馆',weekday:3,startSection:3,endSection:4,weeks:'1-16'},",
    "{name:'中国近现代史纲要',teacher:'刘老师',room:'二教C102',weekday:3,startSection:7,endSection:8,weeks:'2-16双'},",
    "{name:'大学物理',teacher:'周老师',room:'一教A405',weekday:4,startSection:1,endSection:2,weeks:'1-16'},",
    "{name:'物理实验',teacher:'吴老师',room:'物理楼301',weekday:4,startSection:5,endSection:6,weeks:'1-8'},",
    "{name:'形势与政策',teacher:'郑老师',room:'二教A101',weekday:5,startSection:1,endSection:2,weeks:'1-8单'},",
    "{name:'创新创业基础',teacher:'孙老师',room:'三教D208',weekday:5,startSection:3,endSection:4,weeks:'1-16'}",
    '].map(function(c,i){',
    "c.id='bm-'+i+'-'+Date.now();",
    'c.weekParity=parseParity(c.weeks);',
    'return c;',
    '});',
    '}',
    'try{',
    'var courses=extractCourses();',
    "if(!courses.length){alert('未提取到课程，请确认当前是课表页面');return;}",
    'var payload={version:1,school:"四川轻化工大学",updatedAt:new Date().toISOString(),courses:courses};',
    "location.href=TARGET+'?d='+b64url(JSON.stringify(payload));",
    '}catch(e){',
    "alert('导入失败：'+(e&&e.message?e.message:e));",
    '}',
    '})();',
  ]

  return lines.join('')
}

/**
 * 正方课表表格解析模板（拿到真实 HTML 后，把 extractCourses 换成此逻辑）。
 * 典型结构：#kbgrid / table，行=节次，列=星期。
 */
export const ZF_PARSER_TEMPLATE = `
function extractCoursesFromPage(){
  var table=document.querySelector('#kbgrid')||document.querySelector('table');
  if(!table) throw new Error('未找到课表表格');
  var courses=[];
  var rows=table.querySelectorAll('tr');
  rows.forEach(function(tr,ri){
    if(ri===0) return;
    var cells=tr.children;
    for(var ci=1;ci<cells.length && ci<=7;ci++){
      var cell=cells[ci];
      var text=(cell.innerText||cell.textContent||'').trim();
      if(!text) continue;
      var blocks=text.split(/\\n\\s*\\n/).map(function(s){return s.trim()}).filter(Boolean);
      blocks.forEach(function(block){
        var lines=block.split(/\\n+/).map(function(s){return s.trim()}).filter(Boolean);
        if(!lines.length) return;
        var name=lines[0].replace(/\\(.*?\\)/,'').trim();
        var teacher='', room='', weeks='1-16';
        lines.slice(1).forEach(function(line){
          if(/周/.test(line)||/\\d+[-~]\\d+/.test(line)) weeks=line.replace(/周/g,'').trim();
          else if(/楼|室|馆|场|机房|实验室|教/.test(line)) room=line;
          else if(!teacher) teacher=line;
        });
        var secMatch=(tr.querySelector('td,th')||{}).innerText||'';
        var sec=parseInt(String(secMatch).match(/\\d+/)||[ri],10)||ri;
        courses.push({
          id:'zf-'+ri+'-'+ci+'-'+courses.length,
          name:name||'未命名课程',
          teacher:teacher||'未知教师',
          room:room||'未知教室',
          weekday:ci,
          startSection:sec,
          endSection:sec,
          weeks:weeks,
          weekParity:parseParity(weeks)
        });
      });
    }
  });
  return courses;
}
`.trim()

export function minifyBookmarklet(src: string): string {
  const compact = src.replace(/\s+/g, ' ').trim()
  return 'javascript:' + encodeURIComponent(compact)
}
