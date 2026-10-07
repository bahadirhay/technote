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

## El yazısını yazıya çevirme (ücretsiz: Google Gemini)

`api/ocr.ts` Vercel sunucu fonksiyonudur. Sadece giriş yapmış ve onaylı kullanıcılar çağırabilir.

Vercel → Settings → Environment Variables:
- `GEMINI_API_KEY` (önerilen, ücretsiz, kart istemez): aistudio.google.com → "Get API key".
- `GEMINI_MODEL` (isteğe bağlı): varsayılan `gemini-flash-latest`.
- `OCR_DAILY_LIMIT` (isteğe bağlı): kullanıcı başı günlük çeviri sayısı, varsayılan 30. Sınır için `supabase/migration-003-ocr-limit.sql` çalıştırılmalı.
- `ANTHROPIC_API_KEY` (isteğe bağlı, ÜCRETLİ): sadece `GEMINI_API_KEY` yoksa kullanılır.

Gizlilik: Gemini ücretsiz katmanında gönderilen içerik Google tarafından ürün geliştirmede kullanılabilir.
Apple Scribble Türkçeyi desteklemez, bu yüzden kullanılmıyor.

Kullanım:
- "Seç / taşı" ile el yazısını çevrele → "Aa Yazıya çevir"
- Sayfanın altındaki "Aa Çevir": sayfadaki tüm el yazısını tek istekle çevirir (geri alınabilir).
- Aranabilir el yazısı: sayfadan çıkarken ya da yazmayı bırakıp 45 sn geçince, değişen sayfa bir kez okutulur ve metni
  sayfada gizli saklanır (yazı olduğu gibi kalır). Ana ekrandaki "Tüm notlarda ara" bu metni de tarar.
  Hesabım'dan kapatılabilir. Bu istekler de günlük sınıra (OCR_DAILY_LIMIT) sayılır.

## Şekil düzeltme

Kalemle şekil çiz, parmağını kaldırmadan yarım saniye bekle: daire, dikdörtgen, üçgen ve çizgi düzgün şekle döner.
