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
- Yedek servis (isteğe bağlı, Gemini hata verirse sırayla denenir; OpenAI uyumlu herhangi bir servis):
  `OCR_ALT_BASE_URL`, `OCR_ALT_API_KEY`, `OCR_ALT_MODEL`. Örnek (Groq, kart istemez):
  `https://api.groq.com/openai/v1`, model `meta-llama/llama-4-scout-17b-16e-instruct`. Model adlarını sağlayıcının
  belgesinden doğrula; Hesabım → "Servisi test et" hangi servisin cevap verdiğini gösterir.
- `ANTHROPIC_API_KEY` (isteğe bağlı, ÜCRETLİ, zincirin en sonu): sadece `GEMINI_API_KEY` yoksa kullanılır.

Sorun giderme: yönetici olarak Hesabım → "El yazısı çevirme" bölümünde "Sunucu durumu" satırı hangi ayarın eksik
olduğunu (sadece adını) gösterir. Servis hazır değilse normal kullanıcılar Aa düğmelerini hiç görmez.
Vercel'de değişken eklemek/değiştirmek ancak YENİ bir yayında (deploy) geçerli olur; "Production" ortamı işaretli olmalı.

Gizlilik: Gemini ücretsiz katmanında gönderilen içerik Google tarafından ürün geliştirmede kullanılabilir.
Cihazda çalışan alternatif: Apple Scribble. Apple'ın özellik sayfasına göre Türkçe iPadOS 27 ile eklendi.
Yazı kutusuna (T Yazı) Apple Pencil ile yazınca iPad el yazısını cihaz içinde yazıya çevirir; sunucu ve kota gerekmez.
Hesabım'daki "Kalemle yazma testi" ile denenebilir. Scribble sadece yazı alanlarında çalışır; çizilmiş mevcut
çizgileri çevirmez (onun için yukarıdaki sunucu servisi gerekir).

Kullanım:
- "Seç / taşı" ile el yazısını çevrele → "Aa Yazıya çevir"
- Sayfanın altındaki "Aa Çevir": sayfadaki tüm el yazısını tek istekle çevirir (geri alınabilir).
- Aranabilir el yazısı: sayfadan çıkarken ya da yazmayı bırakıp 45 sn geçince, değişen sayfa bir kez okutulur ve metni
  sayfada gizli saklanır (yazı olduğu gibi kalır). Ana ekrandaki "Tüm notlarda ara" bu metni de tarar.
  Hesabım'dan kapatılabilir. Bu istekler de günlük sınıra (OCR_DAILY_LIMIT) sayılır.

## Şekil düzeltme

Kalemle şekil çiz, parmağını kaldırmadan yarım saniye bekle: daire, dikdörtgen, üçgen ve çizgi düzgün şekle döner.

## Kamera ve ses kaydı

- **📷 Kamera:** Çek (fotoğraf sayfaya eklenir, ekran açık kalır, art arda çekilebilir), ⏸ Dondur / ▶ Devam (önizlemeyi
  durdurur), 🔄 Çevir (ön/arka kamera), ⏹ Kapat (kamerayı serbest bırakır).
- **🎙 Kayıt:** ⏺ Başlat, ⏸ Duraklat, ▶ Devam, ⏹ Durdur. Süre duraklatmaları saymaz. Kayıt sırasında çizilen her çizgiye
  kaydın zamanı eklenir; çizgiyi seçip "▶ Buradan dinle" ile o ana atlanır.
- **🎧 Kayıtlar:** Oynat / duraklat / durdur, 10 sn ileri-geri, hız, yeniden adlandır, sil. Küçültünce yazarken dinlenir.
- Sesler kullanıcıya özel yolda saklanır (`<kullanıcı>/aud-<id>`), mevcut depolama kuralı geçerlidir. En uzun kayıt 2 saat.
- Bilinen sınır: web uygulamasında ekran kilitlenirse veya başka uygulamaya geçilirse kayıt durabilir
  (ekran kapanmasın diye Wake Lock istenir). Yedek dosyasına ses dahil değildir.
