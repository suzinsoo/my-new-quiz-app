// api/generate-quiz.js (Node.js 서버리스 함수)

// Vercel/Netlify 환경에서 자동으로 로드되는 환경 변수 사용
// 이 키는 Vercel 대시보드에서 설정할 GEMINI_API_KEY 환경 변수에서 가져옵니다.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 서버리스 함수의 기본 핸들러
export default async function handler(req, res) {
    // POST 요청만 처리
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 클라이언트에서 전송된 요청 본문(body)에서 필요한 데이터 추출
    const { contents, generationConfig } = req.body;

    // Gemini API 키가 설정되어 있는지 확인
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set in environment variables.");
        return res.status(500).json({ error: 'Server configuration error: API key missing.' });
    }

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

        console.log("Serverless Function: Calling Gemini API...");
        // Gemini API 호출
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, generationConfig }) // 클라이언트에서 받은 페이로드 그대로 전달
        });

        // Gemini API 응답이 성공적인지 확인
        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error("Serverless Function: Gemini API HTTP Error details:", errorData);
            return res.status(geminiResponse.status).json({
                error: `Gemini API error: ${errorData.error?.message || geminiResponse.statusText}`
            });
        }

        const geminiResult = await geminiResponse.json();
        console.log("Serverless Function: Received result from Gemini API.");

        // Gemini API의 응답을 클라이언트에 그대로 전달
        return res.status(200).json(geminiResult);

    } catch (error) {
        console.error("Serverless Function: Error processing request:", error);
        return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
    }
}
