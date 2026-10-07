# TechNote

iPad için ücretsiz defter / PDF / Apple Pencil not uygulaması (PWA).

- Ders başına ayrı defter, her defterde sayfalar
- Apple Pencil ile yazma (basınç hassasiyeti, parmakla kaydırma)
- Kalem, fosforlu, silgi, renk ve kalınlık
- PDF ekleyip üzerine yazma
- Yazı kutusu: font ve boyut seçimi
- Veriler cihazda (IndexedDB); "Yedekle" ile JSON dışa aktarma

## Geliştirme

```
npm install
npm run dev
npm run build
```

iPad'de Safari'den açıp Paylaş → "Ana Ekrana Ekle" ile uygulama gibi kullanılır.

## Hesap sistemi (Supabase)

1. Supabase projesinde `supabase/schema.sql` dosyasını SQL Editor'da çalıştır.
2. `.env.example` dosyasını `.env.local` olarak kopyalayıp URL ve anon key'i yaz (Vercel'de de aynı iki değişken).
3. Uygulamada kendi hesabınla kayıt ol, sonra SQL Editor'da `schema.sql` sonundaki admin satırını e-postanla çalıştır.
4. Yeni kayıtlar "onay bekliyor" başlar; "Kullanıcılar" ekranından onaylanır veya davet edilir.

## El yazısını yazıya çevirme (Claude)

`api/ocr.ts` Vercel sunucu fonksiyonudur. Sadece giriş yapmış ve onaylı kullanıcılar çağırabilir.

Vercel → Settings → Environment Variables:
- `ANTHROPIC_API_KEY` (zorunlu): console.anthropic.com → API Keys. Aylık harcama limitini orada belirle.
- `OCR_MODEL` (isteğe bağlı): varsayılan `claude-opus-5-5`. Daha ucuz için `claude-sonnet-5-5`.

Kullanım: "Seç / taşı" ile el yazısını çevrele → "Aa Yazıya çevir".

## Şekil düzeltme

Kalemle şekil çiz, parmağını kaldırmadan yarım saniye bekle: daire, dikdörtgen, üçgen ve çizgi düzgün şekle döner.
