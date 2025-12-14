// services/AIService.js
// services/AIService.js

import Constants from 'expo-constants';

// 👇 修改這一段
const OPENAI_API_KEY =
  Constants?.expoConfig?.extra?.OPENAI_API_KEY ||
  Constants?.manifest?.extra?.OPENAI_API_KEY ||
  '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'; 
  // 👆 已經幫你把金鑰填進去了，直接複製這整段即可
// ====== 本地退化：無金鑰時的輔助函式 ======
function isIndoor(types = []) {
  const t = new Set(types);
  return (
    t.has('shopping_mall') || t.has('department_store') || t.has('museum') ||
    t.has('art_gallery') || t.has('cafe') || t.has('restaurant') ||
    t.has('book_store') || t.has('movie_theater') || t.has('aquarium')
  );
}

function localHeuristicSummary(place, nearbyParking) {
  const rating = place?.rating ?? null;
  const types = (place?.types || []).slice(0, 3).join('、') || '旅遊景點';
  const oneLine = `${place?.name || '此地'}：${rating ? `評分 ${rating}，` : ''}適合${types}。`;
  const tags = [];
  if ((place?.types || []).includes('tourist_attraction')) tags.push('拍照');
  if ((place?.types || []).includes('restaurant') || (place?.types || []).includes('cafe')) tags.push('美食');
  if ((place?.types || []).includes('park')) tags.push('戶外');
  if (tags.length === 0) tags.push('輕鬆走走');
  let bestTime = '午';
  if ((place?.opening_hours?.open_now === true)) bestTime = '晚';
  if (rating && rating >= 4.6) tags.push('高評分');
  const tips = [];
  if (nearbyParking?.count > 0) tips.push(`附近約 ${nearbyParking.count} 個停車點`);
  const mobilityNote = nearbyParking?.count > 0 ? '周邊停車資源尚可。' : '建議大眾運輸。';
  return { oneLine, tags, bestTime, tips, mobilityNote };
}

// ====== 原有的功能：單點摘要 ======
// services/AIService.js

// ... (前面的 code 不變)

// services/AIService.js 的 generateItineraryWithAI

// services/AIService.js

// ... (前面的 code 不變)

export async function generateItineraryWithAI(destination, days, style) {
  console.log(`[AIService] 呼叫生成: ${destination}, ${days}天, 風格:${style}`);
  
  if (!OPENAI_API_KEY) {
    console.warn("❌ No API Key found in AIService");
    return null; 
  }

  const randomSeed = Math.floor(Math.random() * 10000);

  // 🔥 升級版 Prompt：適用全台灣所有地區
  const systemPrompt = `
你是一位精通**全台灣旅遊**的規劃大師（涵蓋北、中、南、東、離島）。
請根據使用者提供的「地點（${destination}）、天數、風格」，規劃一份**在地化且順路**的行程。

【⚡️ 核心邏輯：自動分區，拒絕折返跑！】
1. **📍 智慧地理分區 (最重要的規則)**：
   - 請先分析「${destination}」的地理分佈，將景點劃分為不同的「群聚區域」。
   - **每一天的行程必須嚴格集中在同一個區域**，點與點之間交通不超過 20 分鐘。
   - **不同天必須去不同的區域**，展現該縣市的多元面貌。
   
   *(分區舉例，請依實際地點變通)*：
   - **若去台北**：Day 1 信義大安區，Day 2 淡水北投區。
   - **若去台中**：Day 1 市區(勤美/歌劇院)，Day 2 海線(高美/三井) 或 山線(新社)。
   - **若去台南**：Day 1 中西區古蹟巷弄，Day 2 安平港區與四草。
   - **若去高雄**：Day 1 駁二/旗津，Day 2 左營/蓮池潭。

2. **🎨 體驗豐富化**：
   - 避免連續兩天做一樣的事（例如不要兩天都逛百貨公司）。
   - 如果 Day 1 是「熱鬧市區」，Day 2 請安排「自然/人文/老街」。

3. **🍽️ 在地美食與時間**：
   - **必吃名產**：請安排該地區的特色食物（如嘉義雞肉飯、台南牛肉湯、花蓮扁食）。
   - **夜市規則**：夜市 (Night Market) 只能排在 18:00 後。
   - **店名真實性**：必須給出 Google Maps 找得到的真實店名。

【必須嚴格遵守的 JSON 格式】：
請直接回傳 JSON Array，不要 Markdown，不要解釋。
每一天的 places 陣列裡，每個物件**必須**包含以下 4 個欄位：
- "name": 地點名稱 (繁體中文，必填)
- "type": 類型 (例如 "景點", "餐廳", "逛街", "夜市")
- "time": 時間 (例如 "10:00 - 12:00")
- "reason": 推薦理由 (繁體中文，請寫出該地點的亮點)

【JSON 輸出範例】：
[
  {
    "day": 1,
    "theme": "台南古都巡禮",
    "places": [
      { "name": "赤崁樓", "type": "景點", "time": "10:00 - 11:30", "reason": "荷蘭時期的歷史古蹟" },
      { "name": "文章牛肉湯", "type": "餐廳", "time": "12:00 - 13:00", "reason": "台南必喝新鮮溫體牛" },
      { "name": "神農街", "type": "景點", "time": "14:00 - 16:00", "reason": "充滿文創氣息的老屋街道" },
      { "name": "花園夜市", "type": "夜市", "time": "18:30 - 21:00", "reason": "台南規模最大的流動夜市" }
    ]
  }
]
`;

  const userPrompt = `目的地：${destination}
天數：${days} 天
風格：${style}
(隨機參數: ${randomSeed})

請幫我規劃行程，**請確保兩天的地理位置完全不同**（例如一天在市區，一天在郊區），並且路線要非常順路！`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7, 
      }),
    });

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    const cleanJson = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    return JSON.parse(cleanJson);

  } catch (e) {
    console.error("[AIService] Error:", e);
    return null;
  }
}