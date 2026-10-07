import { useState } from 'react'

export type SaveChoice = 'icloud' | 'device'

// Kayıttan önce: iCloud'a kaydetme ekranı açılsın mı? (iOS bunu kendi başına yapamaz, kullanıcı bir kez dokunur)
export function RecordConsent({ onChoose, onCancel }: { onChoose: (c: SaveChoice, remember: boolean) => void; onCancel: () => void }) {
  const [remember, setRemember] = useState(false)
  return (
    <div className="modal-back" role="dialog" aria-label="Ses kaydı onayı">
      <div className="modal">
        <h2>🎙 Ses kaydı</h2>
        <ul>
          <li>Kayıt <b>cihazında</b> saklanır, bizim sunucumuza <b>gönderilmez</b>.</li>
          <li>
            Kayıt bitince, iCloud Drive'a kaydetmen için kaydetme ekranı <b>açılır</b>. Orada <b>Dosyalara Kaydet → iCloud
            Drive</b>'ı seçersen kayıt <b>iCloud hesabına</b> (Apple'ın sunucusunda, sana ait alana) kaydedilir.
          </li>
          <li>Bunu iPad/iPhone senin yerine kendiliğinden yapamaz: her kayıt sonunda <b>bir kez dokunman</b> gerekir.</li>
          <li>Başkalarının sesini kaydederken (öğretmen, arkadaşların) izin almayı unutma.</li>
        </ul>
        <p className="ask">Kayıt bitince iCloud'a kaydetme ekranı açılsın mı?</p>
        <button className="on" onClick={() => onChoose('icloud', remember)}>☁ Evet, onaylıyorum</button>
        <button onClick={() => onChoose('device', remember)}>📱 Hayır, sadece bu cihazda kalsın</button>
        <button className="link" onClick={onCancel}>Vazgeç</button>
        <label className="check small">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Seçimimi hatırla, bir daha sorma (Hesabım'dan değiştirebilirsin)
        </label>
      </div>
    </div>
  )
}

// Kayıttan sonra: büyük tek düğme. Paylaşım ekranı dokunuşla açılmak zorunda olduğu için ayrı bir adım.
export function SaveSheet({ name, onSave, onLater }: { name: string; onSave: () => void; onLater: () => void }) {
  return (
    <div className="modal-back" role="dialog" aria-label="Kaydı iCloud'a kaydet">
      <div className="modal">
        <h2>✅ Kayıt hazır</h2>
        <p className="muted">{name}</p>
        <p>
          iCloud Drive'a kaydetmek için aşağıya dokun. Açılan ekranda <b>Dosyalara Kaydet</b> → <b>iCloud Drive</b>'ı seç.
        </p>
        <button className="on big" onClick={onSave}>☁ iCloud Drive'a kaydet</button>
        <button className="link" onClick={onLater}>Şimdi değil (cihazda kalır, sonra Kayıtlar'dan kaydedebilirsin)</button>
      </div>
    </div>
  )
}
