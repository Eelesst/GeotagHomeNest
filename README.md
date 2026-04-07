# Image GeoTag & Metadata Tool

Công cụ gắn GPS, metadata và sinh SEO tags cho hình ảnh — chạy 100% trên trình duyệt, không cần server.

## ✨ Tính năng

- 📍 **Gắn GPS** cho ảnh qua bản đồ tương tác (Leaflet)
- 🏷️ **Sinh SEO Tags** tự động từ tên file (offline, không cần API)
- 🤖 **AI Enhancement** (tùy chọn) — nâng cấp tags bằng Google Gemini API
- 📝 **Metadata EXIF** — ghi Title, Subject, Tags, Comment, Author, Copyright
- 📦 **Tải ZIP** — xuất tất cả ảnh đã xử lý trong 1 file ZIP
- 🌐 **Song ngữ** — tự nhận diện tiếng Việt/Anh từ tên file

## 🚀 Sử dụng

1. Mở tool tại: https://geotag-home-nest.vercel.app/
2. Kéo thả ảnh vào tool
3. Chọn vị trí GPS trên bản đồ → Áp dụng GPS
4. Bấm 🤖 AI Tags để sinh tags + description
5. Bấm Ghi Metadata → Tải ZIP

## 🔑 AI Mode (tùy chọn)

Để sử dụng Gemini AI bổ sung tags:
1. Lấy API key miễn phí tại https://openrouter.ai/
2. Bật toggle "AI Mode" trên tool
3. Dán API key vào

> Tool vẫn hoạt động tốt mà KHÔNG cần API key (chế độ offline).

## 🛠️ Công nghệ

- HTML/CSS/JS (vanilla)
- [Leaflet](https://leafletjs.com/) — bản đồ
- [piexifjs](https://github.com/nicklockwood/piexifjs) — đọc/ghi EXIF
- [JSZip](https://stuk.github.io/jszip/) — tạo ZIP
- [FileSaver.js](https://github.com/nicklockwood/FileSaver.js) — tải file

## 📄 License

MIT License
