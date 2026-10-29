/* EGZO Recepcja — wtyczka Obsidiana (bez kompilacji, zwykły JS).
   - Panel „Recepcja EGZO”: strona asystentki (artefakt w Claude) w osadzonym oknie przeglądarki Obsidiana (<webview>),
     z trwałym logowaniem (partycja persist:egzo-recepcja). Pierwszy raz trzeba się w nim zalogować do claude.ai.
   - Otwiera się sam obok notatki „00 CENTRUM” (Panel Dziś) — notatkę generuje silnik, więc jej nie zmieniamy.
   - Łącznik: wyslij(tekst) przekazuje polecenie do asystentki (postMessage do wszystkich ramek strony);
     strona odsyła stan „mówi / nie mówi”, żeby przyszły nasłuch „Hej, Egzo” nie słyszał jej samej.
   Zabezpieczenia: wtyczka nie czyta notatek ani plików; jedyne dane, które przekazuje, to tekst polecenia. */
const { Plugin, ItemView, Notice, Modal, Setting, PluginSettingTab } = require('obsidian');

const WIDOK = 'egzo-recepcja-widok';
const DOMYSLNE = {
  adres: 'https://egzosystems.github.io/egzo-recepcja/',   // wersja z mikrofonem (rozmowa przez klucz Gemini zapisany w tym panelu)
  notatkaPanelu: '00 CENTRUM.md',
  otwierajZPanelem: true
};

class WidokRecepcji extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.web = null; this.mowi = false; }
  getViewType() { return WIDOK; }
  getDisplayText() { return 'Recepcja EGZO'; }
  getIcon() { return 'bot'; }
  async onOpen() {
    const el = this.contentEl; el.empty(); el.addClass('egzo-recepcja');
    el.style.padding = '0'; el.style.overflow = 'hidden';
    const w = document.createElement('webview');
    w.setAttribute('src', this.plugin.ustawienia.adres);
    w.setAttribute('partition', 'persist:egzo-recepcja');
    w.setAttribute('allowpopups', '');            // logowanie Google/Claude otwiera okienko
    w.style.width = '100%'; w.style.height = '100%'; w.style.border = '0';
    el.appendChild(w); this.web = w;
    // mikrofon w panelu: Obsidian (Electron) domyślnie pyta/odmawia — zezwalamy tylko stronie recepcji
    try { const { session } = require('electron').remote || require('@electron/remote');
      const ses = session.fromPartition('persist:egzo-recepcja'), dozw = new URL(this.plugin.ustawienia.adres).origin;
      ses.setPermissionRequestHandler((wc, perm, cb, det) => cb(['media','audioCapture','microphone','wake-lock','screen-wake-lock'].includes(perm) && String((det && det.requestingUrl) || wc.getURL()).startsWith(dozw)));
      ses.setPermissionCheckHandler((wc, perm, origin) => ['media','audioCapture','microphone'].includes(perm) ? String(origin).startsWith(dozw) : false);
    } catch (e) { /* bez dostępu do sesji: strona zapyta sama */ }
    // stan „mówi” ze strony: nasłuchujemy w oknie głównym strony i odczytujemy co chwilę
    w.addEventListener('dom-ready', () => {
      w.executeJavaScript(`(function(){ if(window.__egzoStan) return; window.__egzoStan={mowi:false,t:0};
        addEventListener('message',e=>{ const d=e.data; if(d&&d.egzo==='stan'){ window.__egzoStan={mowi:!!d.mowi,t:Date.now()}; } }); })()`).catch(() => {});
    });
    this.zegar = window.setInterval(async () => {
      if (!this.web) return;
      try { const s = await this.web.executeJavaScript('window.__egzoStan||null'); if (s) this.mowi = !!s.mowi; } catch (e) {}
    }, 300);
  }
  async onClose() { if (this.zegar) window.clearInterval(this.zegar); this.web = null; }
  // przekazanie wiadomości do strony asystentki (wszystkie ramki — strona sprawdza nadawcę)
  async wyslij(dane) {
    if (!this.web) return false;
    const js = `(function(){ const m=${JSON.stringify(dane)}; function wszystkie(w){ try{ w.postMessage(m,'*'); }catch(e){}
      try{ for(let i=0;i<w.frames.length;i++) wszystkie(w.frames[i]); }catch(e){} } wszystkie(window); return true; })()`;
    try { return await this.web.executeJavaScript(js); } catch (e) { return false; }
  }
}

class OknoTekstu extends Modal {
  constructor(app, naTekst) { super(app); this.naTekst = naTekst; }
  onOpen() {
    this.titleEl.setText('Powiedz do asystentki (tekstem)');
    const i = this.contentEl.createEl('input', { type: 'text' }); i.style.width = '100%';
    i.placeholder = 'Np. co dziś czeka na akceptację?';
    i.addEventListener('keydown', e => { if (e.key === 'Enter' && i.value.trim()) { this.naTekst(i.value.trim()); this.close(); } });
    window.setTimeout(() => i.focus(), 50);
  }
}

class UstawieniaRecepcji extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const el = this.containerEl; el.empty();
    new Setting(el).setName('Adres recepcji').setDesc('Link do strony asystentki w Claude.')
      .addText(t => t.setValue(this.plugin.ustawienia.adres).onChange(async v => { this.plugin.ustawienia.adres = v.trim(); await this.plugin.zapisz(); }));
    new Setting(el).setName('Notatka Panelu Dziś').setDesc('Przy jej otwarciu panel recepcji otwiera się obok.')
      .addText(t => t.setValue(this.plugin.ustawienia.notatkaPanelu).onChange(async v => { this.plugin.ustawienia.notatkaPanelu = v.trim(); await this.plugin.zapisz(); }));
    new Setting(el).setName('Otwieraj razem z Panelem Dziś')
      .addToggle(t => t.setValue(this.plugin.ustawienia.otwierajZPanelem).onChange(async v => { this.plugin.ustawienia.otwierajZPanelem = v; await this.plugin.zapisz(); }));
  }
}

module.exports = class EgzoRecepcja extends Plugin {
  async onload() {
    this.ustawienia = Object.assign({}, DOMYSLNE, await this.loadData());
    if (/claude\.ai\/artifact\//.test(this.ustawienia.adres || '')) { this.ustawienia.adres = DOMYSLNE.adres; await this.zapisz(); }   // stara wersja w Claude nie ma mikrofonu
    this.registerView(WIDOK, leaf => new WidokRecepcji(leaf, this));
    this.addRibbonIcon('bot', 'Recepcja EGZO', () => this.pokaz(true));
    this.addCommand({ id: 'otworz', name: 'Otwórz recepcję', callback: () => this.pokaz(true) });
    this.addCommand({ id: 'powiedz', name: 'Powiedz do asystentki (tekstem)', callback: () =>
      new OknoTekstu(this.app, t => this.polecenie(t)).open() });
    this.addSettingTab(new UstawieniaRecepcji(this.app, this));
    // Panel Dziś: przy otwarciu notatki 00 CENTRUM recepcja pojawia się obok (raz na otwarcie, bez dublowania)
    this.registerEvent(this.app.workspace.on('file-open', f => {
      if (f && this.ustawienia.otwierajZPanelem && f.path === this.ustawienia.notatkaPanelu) this.pokaz(false);
    }));
  }
  onunload() {}
  async zapisz() { await this.saveData(this.ustawienia); }
  widok() { const l = this.app.workspace.getLeavesOfType(WIDOK)[0]; return l ? l.view : null; }
  async pokaz(aktywuj) {
    let leaf = this.app.workspace.getLeavesOfType(WIDOK)[0];
    if (!leaf) { leaf = this.app.workspace.getRightLeaf(false); await leaf.setViewState({ type: WIDOK, active: !!aktywuj }); }
    this.app.workspace.revealLeaf(leaf);
    return leaf.view;
  }
  // polecenie dla asystentki (z okna tekstu albo z nasłuchu „Hej, Egzo”)
  async polecenie(tekst) {
    const v = await this.pokaz(false);
    const ok = v && await v.wyslij({ egzo: 'glos', tekst });
    if (!ok) new Notice('Recepcja nie jest gotowa — otwórz panel i zaloguj się do Claude.');
  }
};
