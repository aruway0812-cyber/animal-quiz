# 🐾 動物問答：課堂即時互動遊戲

這是一個類似 Kahoot 的上課互動遊戲，採用可愛動物風格。

- **老師端**（投影）：`/host`
- **學生端**（手機）：`/`，用手機掃 QR Code 就能加入

## 怎麼改題目

打開 `questions.js`，照著裡面的格式修改或新增題目：

```js
{
  section: '觀念快問快答',      // 小標題（可留空）
  type: 'mc',                   // 'mc' 單選題；'tf' 是非題
  text: '題目文字',
  options: ['選項A', '選項B', '選項C', '選項D'],  // 是非題寫 ['O 正確', 'X 錯誤']
  answer: 1,                    // 正確答案位置：A=0, B=1, C=2, D=3（是非題 O=0, X=1）
  time: 20,                     // 限時秒數
  explain: '公布答案時顯示的解析',
},
```

改完後要重新啟動網站，新題目才會生效。

## 在自己電腦上試玩

需要先安裝 [Node.js](https://nodejs.org)（18 版以上）。

```bash
npm install
npm start
```

啟動後：

- 用瀏覽器打開 http://localhost:3000/host 當作老師端。
- 再開另一個分頁打開 http://localhost:3000 當作學生端，就能自己測試。

## 上線讓學生用手機連（建議用 Render，免費）

1. 把這個資料夾上傳到 GitHub（建立一個新的 repository）。
2. 到 https://render.com 用 GitHub 帳號登入，點 **New → Web Service**，選這個 repository。
3. 設定以下內容：
   - Build Command：`npm install`
   - Start Command：`npm start`
   - Instance Type：Free
4. 部署完成後會拿到一個網址，例如 `https://animal-quiz-xxxx.onrender.com`。
   - 老師端：在網址後面加上 `/host`
   - 學生端：直接掃投影幕上的 QR Code

> ⚠️ 免費方案閒置 15 分鐘會休眠。上課前 1～2 分鐘先打開一次老師端，喚醒網站（大約要等 30～60 秒）。

## 上課小提醒

- 老師端按右上角的 ⛶ 可以切換全螢幕，🔊 可以開關音效。
- 學生手機如果斷線或鎖螢幕，重新打開網頁會自動回到遊戲，分數不會不見。
- 大廳裡點學生的名字，可以把不當暱稱移除。
- 分數不會被保存，遊戲結束或重新整理伺服器後就會清空。
- 計分方式：答對可得 500～1000 分，越快答對分數越高；答錯或沒作答得 0 分。
