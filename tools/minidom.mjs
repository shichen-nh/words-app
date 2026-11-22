/* 最小 XML DOM，仅用于 Node 里测试 docx 解析（浏览器用原生 DOMParser） */

class TextNode {
  constructor(t) { this.nodeType = 3; this._text = t; this.childNodes = []; }
  get textContent() { return this._text; }
  get localName() { return '#text'; }
}

class Element {
  constructor(name) {
    this.nodeType = 1;
    this._name = name.split(':').pop();
    this.childNodes = [];
    this._parent = null;
  }
  get localName() { return this._name; }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    const p = this._parent;
    if (!p) return null;
    const i = p.childNodes.indexOf(this);
    return p.childNodes[i + 1] || null;
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  getElementsByTagNameNS(ns, name) {
    const out = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 1 && (name === '*' || c.localName === name)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

class Document {
  constructor() {
    this.nodeType = 9;
    this.childNodes = [];
  }
  get firstChild() { return this.childNodes[0] || null; }
  getElementsByTagNameNS(ns, name) {
    const out = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 1 && (name === '*' || c.localName === name)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}

export class MiniDOMParser {
  parseFromString(str) {
    const doc = new Document();
    const stack = [doc];
    let i = 0;
    while (i < str.length) {
      if (str[i] === '<') {
        if (str.startsWith('<!--', i)) { i = str.indexOf('-->', i); i = i < 0 ? str.length : i + 3; continue; }
        if (str.startsWith('<?', i)) { i = str.indexOf('?>', i); i = i < 0 ? str.length : i + 2; continue; }
        const end = str.indexOf('>', i);
        if (end < 0) break;
        const raw = str.slice(i + 1, end).trim();
        i = end + 1;
        if (!raw) continue;
        if (raw[0] === '/') { stack.pop(); continue; }
        const selfClose = raw.endsWith('/');
        const name = raw.replace(/\/$/, '').split(/\s/)[0];
        const el = new Element(name);
        el._parent = stack[stack.length - 1];
        stack[stack.length - 1].childNodes.push(el);
        if (!selfClose) stack.push(el);
      } else {
        const next = str.indexOf('<', i);
        const text = str.slice(i, next < 0 ? str.length : next);
        if (text) stack[stack.length - 1].childNodes.push(new TextNode(decodeEntities(text)));
        i = next < 0 ? str.length : next;
      }
    }
    return doc;
  }
}
