import { useState } from 'react'
import { supabase } from './cloud'

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMsg(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı.' : error.message)
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() } } })
        if (error) setMsg(error.message)
        else if (!data.session) setMsg('Kayıt alındı. E-postana gelen bağlantıyla doğrula, sonra giriş yap.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form onSubmit={submit}>
        <h1>TechNote</h1>
        <p className="muted">{mode === 'login' ? 'Hesabınla giriş yap' : 'Yeni hesap oluştur (yönetici onayı gerekir)'}</p>
        {mode === 'signup' && (
          <input type="text" placeholder="Adın" autoComplete="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input type="email" placeholder="E-posta" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          placeholder="Şifre (en az 6 karakter)"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="on" disabled={busy}>{mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}</button>
        {msg && <p className="err">{msg}</p>}
        {mode === 'login' && (
          <button
            type="button"
            className="link"
            onClick={async () => {
              if (!email) return setMsg('Önce e-posta adresini yaz, sonra buna dokun.')
              const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
              setMsg(error ? error.message : 'Şifre yenileme bağlantısı e-postana gönderildi.')
            }}
          >
            Şifremi unuttum
          </button>
        )}
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg('') }}>
          {mode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}
        </button>
        <p className="muted" style={{ textAlign: 'center' }}>Sürüm: {__APP_VERSION__}</p>
      </form>
    </div>
  )
}
