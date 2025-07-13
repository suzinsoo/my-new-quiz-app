import React, { useState, useEffect, useCallback, Component } from 'react';

// Firebase SDK를 직접 import하여 사용합니다.
// 필요한 함수들을 명시적으로 가져옵니다.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics"; // Analytics import 추가

// Error Boundary 컴포넌트: React 렌더링 중 발생하는 오류를 잡아내어 표시합니다.
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // 다음 렌더링에서 폴백 UI가 보이도록 상태를 업데이트합니다.
        return { hasError: true, error: error };
    }

    componentDidCatch(error, errorInfo) {
        // 오류 로깅 서비스에 오류를 보고할 수도 있습니다.
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        this.setState({ errorInfo: errorInfo });
    }

    render() {
        if (this.state.hasError) {
            // 폴백 UI를 렌더링합니다.
            return (
                <div className="min-h-screen bg-red-100 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
                        <h2 className="text-2xl font-bold text-red-700 mb-4">
                            🚫 앱 실행 중 오류가 발생했습니다 🚫
                        </h2>
                        <p className="text-gray-700 mb-4">
                            서비스 이용에 불편을 드려 죄송합니다.
                            <br/>
                            문제를 해결하기 위해 노력 중입니다.
                        </p>
                        <details className="text-left text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                            <summary className="font-semibold cursor-pointer">오류 상세 정보 보기</summary>
                            <pre className="whitespace-pre-wrap break-words mt-2">
                                {this.state.error && this.state.error.toString()}
                                <br />
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </pre>
                        </details>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
                        >
                            새로고침
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

const App = () => {
    // Firebase 설정 정보 (사용자님이 제공해주신 값으로 직접 설정)
    // 이 정보는 Firebase 프로젝트 설정에서 가져온 값입니다.
    // **참고: Canvas 환경에서는 __firebase_config 전역 변수를 통해 자동으로 주입됩니다.
    // Canvas 외부에서 배포 시에는 이 값을 사용하거나, 환경 변수로 관리하는 것을 권장합니다.**
    const userProvidedFirebaseConfig = {
        apiKey: "AIzaSyB_I98alPy-nWuOxD6dHgtq6JgnUgoze5Q",
        authDomain: "my-new-quiz-app-941ab.firebaseapp.com",
        projectId: "my-new-quiz-app-941ab",
        storageBucket: "my-new-quiz-app-941ab.firebasestorage.app",
        messagingSenderId: "650675412112",
        appId: "1:650675412112:web:274b95ded1af3565be8c15",
        measurementId: "G-LE1STLTWVM"
    };

    // Canvas 환경에서 제공되는 전역 변수를 우선적으로 사용하고, 없으면 사용자 제공 값 사용
    // eslint-disable-next-line no-undef
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    // eslint-disable-next-line no-undef
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : userProvidedFirebaseConfig;
    // eslint-disable-next-line no-undef
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


    // Firebase 관련 상태
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [analytics, setAnalytics] = useState(null); // Analytics 상태 추가
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false); // Firebase 인증 준비 완료 여부

    // 앱의 현재 모드를 관리 (생성, 테스트, 결과, 퀴즈 생성 완료 후 선택)
    const [appMode, setAppMode] = useState('create'); // 'create', 'test', 'result', 'quizGenerated'
    // URL에서 가져온 테스트 ID
    const [currentTestId, setCurrentTestId] = useState(null);

    // 퀴즈 생성 관련 상태
    const [quizCreatorName, setQuizCreatorName] = useState(''); // 퀴즈 생성자 이름 추가
    const [personalityDescription, setPersonalityDescription] = useState('');
    const [generatedQuiz, setGeneratedQuiz] = useState([]); // { question, options, compatibleAnswer }
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [shareableLink, setShareableLink] = useState(''); // 생성자가 퀴즈를 만든 후 받을 공유 링크
    const [showCopySuccessMessage, setShowCopySuccessMessage] = useState(false); // 클립보드 복사 성공 메시지

    // 퀴즈 테스트 관련 상태
    const [testTakerAnswers, setTestTakerAnswers] = useState({});
    const [isCreator, setIsCreator] = useState(false); // 현재 사용자가 퀴즈 생성자인지 여부
    const [showCorrectAnswers, setShowCorrectAnswers] = useState(false); // 정답 표시 여부 토글 (현재 사용 안 함)
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0); // 현재 질문 인덱스

    const [compatibilityScore, setCompatibilityScore] = useState(null);
    const [compatibilityMessage, setCompatibilityMessage] = useState('');
    const [showResultModal, setShowResultModal] = useState(false); // 결과 모달 표시 여부

    // 한국어 조사 '을/를' 선택 헬퍼 함수 (현재 사용 안 함, 필요 시 활용)
    const getKoreanObjectParticle = (name) => {
        if (!name) return '';
        const lastChar = name.charCodeAt(name.length - 1);
        // 한글 유니코드 범위 (가-힣)
        if (lastChar >= 0xAC00 && lastChar <= 0xD7A3) {
            // 종성(받침)이 있는지 확인
            if ((lastChar - 0xAC00) % 28 > 0) {
                return '을'; // 받침 O
            }
            return '를'; // 받침 X
        }
        return '을'; // 한글이 아니면 기본 '을' (혹은 '를'로 변경 가능)
    };

    // Firebase 초기화 및 인증 상태 리스너 설정 (컴포넌트 마운트 시 한 번만 실행)
    useEffect(() => {
        const initializeFirebase = async () => {
            try {
                if (!Object.keys(firebaseConfig).length) {
                    console.error("Firebase config is empty. Cannot initialize Firebase.");
                    setError("Firebase 설정 정보를 불러올 수 없습니다. 앱을 초기화할 수 없습니다.");
                    setIsAuthReady(true);
                    return;
                }

                const firebaseApp = initializeApp(firebaseConfig);
                const firestoreDb = getFirestore(firebaseApp);
                const firebaseAuth = getAuth(firebaseApp);
                const firebaseAnalytics = getAnalytics(firebaseApp); // Analytics 초기화

                setDb(firestoreDb);
                setAuth(firebaseAuth);
                setAnalytics(firebaseAnalytics); // Analytics 상태 설정
                console.log("Firebase services initialized:", { firestoreDb, firebaseAuth, firebaseAnalytics }); // Debug log
                console.log("Firebase config used:", firebaseConfig); // Debug log

                onAuthStateChanged(firebaseAuth, async (user) => {
                    if (user) {
                        setUserId(user.uid);
                        console.log("User authenticated:", user.uid); // Debug log
                    } else {
                        if (initialAuthToken) {
                            await signInWithCustomToken(firebaseAuth, initialAuthToken);
                            setUserId(firebaseAuth.currentUser?.uid);
                            console.log("Signed in with custom token:", firebaseAuth.currentUser?.uid); // Debug log
                        } else {
                            await signInAnonymously(firebaseAuth);
                            setUserId(firebaseAuth.currentUser?.uid || crypto.randomUUID());
                            console.log("Signed in anonymously:", firebaseAuth.currentUser?.uid); // Debug log
                        }
                    }
                    setIsAuthReady(true); // Firebase 인증 준비 완료 상태 설정
                    console.log("Firebase Auth Ready:", true); // Debug log
                });

            } catch (err) {
                console.error("Firebase initialization error:", err);
                setError("Firebase 초기화 중 오류가 발생했습니다.");
                setIsAuthReady(true);
            }
        };

        initializeFirebase();
    }, [appId, firebaseConfig, initialAuthToken]); // Add dependencies for global variables


    // URL 파라미터에서 testId 가져오기 및 앱 모드 설정
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const testIdFromUrl = urlParams.get('testId');
        if (testIdFromUrl) {
            setCurrentTestId(testIdFromUrl);
            setAppMode('test'); // URL에 testId가 있으면 'test' 모드로 전환 (친구용)
            console.log("App mode set to 'test' with testId:", testIdFromUrl);
        } else {
            setAppMode('create'); // 없으면 'create' 모드로 전환 (본인용)
            console.log("App mode set to 'create'.");
        }
    }, []);

    // 테스트 모드일 때 퀴즈 데이터 불러오기 (Firestore에서)
    useEffect(() => {
        const fetchQuizData = async () => {
            // 'test' 모드이고, 현재 테스트 ID가 있으며, Firebase가 준비되었을 때만 실행
            if (appMode === 'test' && currentTestId && db && isAuthReady) {
                setIsLoading(true);
                setError('');
                console.log("Attempting to fetch quiz data for testId:", currentTestId);
                try {
                    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'compatibilityTests', currentTestId);

                    const docSnap = await getDoc(docRef);

                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setGeneratedQuiz(data.quizQuestions || []);
                        setPersonalityDescription(data.personalityDescription || '');
                        setQuizCreatorName(data.quizCreatorName || 'OOO'); // 저장된 이름 불러오기
                        console.log("Quiz data fetched:", data);

                        // 현재 사용자가 퀴즈 생성자인지 확인
                        if (userId && data.createdBy === userId) {
                            setIsCreator(true);
                            console.log("Current user is the quiz creator.");
                        } else {
                            setIsCreator(false);
                            console.log("Current user is NOT the quiz creator.");
                        }

                    } else {
                        setError('해당 퀴즈를 찾을 수 없습니다.');
                        setAppMode('create'); // 퀴즈를 찾을 수 없으면 생성 모드로 전환
                        console.log("Quiz document not found for testId:", currentTestId);
                    }
                } catch (err) {
                    console.error("퀴즈 데이터 불러오기 오류:", err);
                    setError('퀴즈 데이터를 불러오는 중 오류이 발생했습니다.');
                    setAppMode('create');
                } finally {
                    setIsLoading(false);
                }
            } else {
                console.log("Skipping quiz data fetch. Conditions not met:", { appMode, currentTestId, dbInitialized: !!db, authReady: isAuthReady });
            }
        };

        fetchQuizData();
    }, [appMode, currentTestId, db, isAuthReady, userId, appId]); // userId, appId를 의존성 배열에 추가

    // 퀴즈 생성 함수 (서버리스 API 호출 및 Firestore 저장)
    const generateQuiz = async () => {
        // 입력 유효성 검사
        if (!quizCreatorName.trim()) { // 이름 입력 필수
            setError('이름을 입력해주세요.');
            return;
        }
        if (!personalityDescription.trim() || personalityDescription.length < 10) {
            setError('10자 이상으로 성향 설명을 입력해주세요.');
            return;
        }
        if (personalityDescription.length > 1000) {
            setError('성향 설명은 1000자를 초과할 수 없습니다.');
            return;
        }

        // Firebase가 완전히 준비되었는지 다시 확인 (버튼 비활성화와 별개로 한번 더 확인)
        if (!db || !userId || !isAuthReady) {
            setError('Firebase 연결 또는 사용자 인증이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
            console.error("Generate Quiz: Firebase db or userId not ready.", { db, userId, isAuthReady }); // Debug log
            return;
        }

        setIsLoading(true);
        setError('');
        setGeneratedQuiz([]);
        setShareableLink('');

        try {
            // Gemini API 호출을 위한 프롬프트 구성
            // 'compatibleAnswer'가 무작위로 선택되도록 명시적으로 지시 추가
            const prompt = `사용자 "${quizCreatorName}"의 성격과 성향, 좋아하는 것, 싫어하는 것을 구분해서 1000자 내외로 분석한 내용입니다: "${personalityDescription}". 이 내용을 바탕으로 "${quizCreatorName}"를 맞춰보는 재미있고 흥미로운 객관식 퀴즈 질문 10개를 생성해 주세요. 각 질문은 4개의 보기(1, 2, 3, 4)를 포함해야 하며, **나머지 3개의 오답은 정답과 전혀 관련 없는, 동떨어진 내용으로 구성하여 변별력을 높여주세요.** 정답(compatibleAnswer)은 4개의 보기 중 무작위로 선택되어야 합니다. 출력은 'question', 'options', 'compatibleAnswer' 필드를 가진 JSON 객체 배열이어야 합니다. 'compatibleAnswer'는 '1', '2', '3', '4' 중 하나여야 합니다.`;

            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });

            const payload = {
                contents: chatHistory,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "question": { "type": "STRING" },
                                "options": {
                                    "type": "ARRAY",
                                    "items": { "type": "STRING" }
                                },
                                "compatibleAnswer": { "type": "STRING" }
                            },
                            "propertyOrdering": ["question", "options", "compatibleAnswer"]
                        }
                    }
                }
            };

            // 서버리스 함수 호출
            // Vercel에 배포 시 이 경로는 Vercel 프로젝트 내의 서버리스 함수를 호출합니다.
            const apiUrl = '/api/generate-quiz'; 

            console.log("Serverless Function API: Fetching quiz with prompt:", prompt); // API 호출 전 로그
            console.log("Serverless Function API: Payload:", payload); // API 호출 페이로드 로그

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log("Serverless Function API: Response received. Status:", response.status, response.statusText); // API 응답 상태 로그

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Serverless Function API: HTTP Error details:", errorData); // HTTP 오류 상세 로그
                // 서버리스 함수에서 발생한 오류 메시지를 사용자에게 보여줍니다.
                throw new Error(`HTTP error! Status: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            const result = await response.json();
            console.log("Serverless Function API: Raw result:", result); // API 원본 결과 로그

            // 서버리스 함수가 Gemini API의 결과를 그대로 반환한다고 가정합니다.
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const jsonText = result.candidates[0].content.parts[0].text;
                console.log("Serverless Function API: Raw JSON text from response:", jsonText); // JSON 텍스트 로그
                const parsedQuiz = JSON.parse(jsonText);

                // 생성된 퀴즈가 10개 질문을 포함하고 올바른 형식인지 검증
                if (Array.isArray(parsedQuiz) && parsedQuiz.length === 10 && parsedQuiz.every(q => q.question && Array.isArray(q.options) && q.options.length === 4 && q.compatibleAnswer && ['1', '2', '3', '4'].includes(q.compatibleAnswer))) {
                    setGeneratedQuiz(parsedQuiz);
                    console.log("Generated quiz parsed and validated:", parsedQuiz);

                    // 퀴즈 생성 성공 시 Firestore에 저장
                    const newTestId = crypto.randomUUID(); // 고유한 테스트 ID 생성
                    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'compatibilityTests', newTestId);
                    await setDoc(docRef, {
                        personalityDescription: personalityDescription,
                        quizCreatorName: quizCreatorName, // 퀴즈 생성자 이름 저장
                        quizQuestions: parsedQuiz,
                        createdAt: serverTimestamp(),
                        createdBy: userId,
                    });
                    console.log("Quiz saved to Firestore with ID:", newTestId);

                    const currentBaseUrl = window.location.origin + window.location.pathname;
                    setShareableLink(`${currentBaseUrl}?testId=${newTestId}`);
                    setCurrentTestId(newTestId); // 생성된 퀴즈의 ID로 설정
                    setAppMode('quizGenerated'); // 퀴즈 생성 후 'quizGenerated' 모드로 전환
                    setIsCreator(true); // 생성자는 자신의 퀴즈를 풀 때 isCreator를 true로 설정
                    console.log("Shareable link generated:", `${currentBaseUrl}?testId=${newTestId}`);
                } else {
                    setError('퀴즈 생성에 실패했습니다. 예상된 형식의 10개 질문을 받지 못했습니다. 다시 시도해 주세요.');
                    console.log("Serverless Function API: Parsed quiz format mismatch:", parsedQuiz); // Debug log
                }
            } else {
                setError('퀴즈 생성에 실패했습니다. 유효한 응답을 받지 못했습니다.');
                console.log("Serverless Function API: No valid candidates found in response."); // Debug log
            }
        } catch (err) {
            console.error("퀴즈 생성 중 오류 발생:", err);
            setError(`퀴즈 생성 중 오류가 발생했습니다: ${err.message}. 네트워크 연결을 확인하거나 다시 시도해 주세요.`); // 오류 메시지 상세화
        } finally {
            setIsLoading(false);
        }
    };

    // 테스트 응답 처리
    const handleAnswerChange = useCallback((questionIndex, selectedValue) => {
        setTestTakerAnswers(prev => {
            const newAnswers = {
                ...prev,
                [questionIndex]: selectedValue
            };
            console.log(`Answer for Q${questionIndex + 1} changed to: ${selectedValue}. Current answers:`, newAnswers); // Debug log
            return newAnswers;
        });
    }, []);

    // 궁합 점수 계산
    const calculateCompatibility = useCallback(() => {
        console.log("Calculating compatibility...");
        // 모든 질문에 답변했는지 확인
        if (Object.keys(testTakerAnswers).length !== generatedQuiz.length) {
            setError('모든 질문에 답변해주세요.');
            console.log("Not all questions answered. Current answers count:", Object.keys(testTakerAnswers).length); // Debug log
            return;
        }

        let correctAnswers = 0;
        // 정답과 사용자의 답변 비교하여 점수 계산
        generatedQuiz.forEach((quizItem, index) => {
            const userAnswer = testTakerAnswers[index];
            const correctAnswer = quizItem.compatibleAnswer;
            console.log(`Q${index + 1}: User answer: ${userAnswer}, Correct answer: ${correctAnswer}. Match: ${userAnswer === correctAnswer}`);
            if (userAnswer === correctAnswer) {
                correctAnswers++;
            }
        });

        console.log("Total correct answers:", correctAnswers);

        let score = 0;
        if (correctAnswers === 0) {
            score = 5; // 0개 맞춰도 5점
        } else if (correctAnswers >= 1 && correctAnswers <= 2) {
            score = 20;
        }
        // 3개 이상 맞췄을 때 20점씩 차등으로 올라가도록 수정
        else if (correctAnswers >= 3 && correctAnswers <= 10) { // 퀴즈가 10개이므로 10까지
            score = 40 + Math.round((correctAnswers - 3) * (60 / 7));
            if (score > 100) score = 100; // 최대 100점
        }

        setCompatibilityScore(score);
        console.log("Final calculated score:", score);

        // 점수에 따른 궁합 메시지 설정
        let message = '';
        if (score >= 90) {
            message = '환상의 궁합! 당신은 이 사람과 완벽하게 잘 맞습니다!';
        } else if (score >= 70) {
            message = '아주 좋은 궁합! 서로를 이해하고 존중하는 관계가 될 수 있습니다.';
        } else if (score >= 50) {
            message = '평범한 궁합. 서로 노력하면 좋은 관계를 유지할 수 있습니다.';
        } else if (score >= 30) {
            message = '조금 다른 궁합. 서로의 차이를 인정하고 이해하는 노력이 필요합니다.';
        } else {
            message = '극과 극의 궁합. 색다른 경험을 할 수도 있지만, 많은 노력이 필요할 수 있습니다.';
        }
        setCompatibilityMessage(message);
        console.log("Final compatibility message:", message);

        console.log("Attempting to show result modal...");
        setShowResultModal(true);
        console.log("setShowResultModal(true) called.");
    }, [generatedQuiz, testTakerAnswers]);

    // 결과 모달 닫기
    const closeResultModal = () => {
        setShowResultModal(false);
        setAppMode('result'); // 결과 모드로 전환 (공유 버튼 등을 위해)
        console.log("Result modal closed. App mode set to 'result'."); // Debug log
    };

    // 공유 링크 클립보드 복사
    const copyShareLink = useCallback(() => {
        if (shareableLink) {
            const tempInput = document.createElement('textarea');
            tempInput.value = shareableLink;
            document.body.appendChild(tempInput);
            tempInput.select(); // Corrected: select the textarea itself
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            setShowCopySuccessMessage(true);
            setTimeout(() => setShowCopySuccessMessage(false), 3000); // Hide after 3 seconds
            console.log("Share link copied to clipboard:", shareableLink); // Debug log
        }
    }, [shareableLink]);

    // 새로운 테스트 만들기 (모든 상태 초기화 후 create 모드로)
    const createNewTest = useCallback(() => {
        setAppMode('create');
        setPersonalityDescription('');
        setGeneratedQuiz([]);
        setTestTakerAnswers({});
        setCompatibilityScore(null);
        setCompatibilityMessage('');
        setShareableLink('');
        setQuizCreatorName(''); // 이름 초기화
        setCurrentQuestionIndex(0); // 질문 인덱스 초기화
    }, []);

    // 모달 컴포넌트
    const Modal = ({ children, onClose }) => (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md relative">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                    &times;
                </button>
                {children}
            </div>
        </div>
    );

    return (
        // ErrorBoundary로 App 컴포넌트를 감싸서 렌더링 오류를 처리합니다.
        <ErrorBoundary>
            <div className="min-h-screen bg-white flex items-center justify-center p-0 font-gmarketsans text-gray-800"> {/* 배경색 흰색으로 변경, 전체 패딩 제거 */}
                {/* 워터마크 이미지 */}
                <img
                    src="https://i.ibb.co/k2T49gBt/image.png" // 사용자님이 제공한 새로운 이미지 링크
                    alt="워터마크 이미지"
                    className="fixed bottom-4 right-4 w-1/6 h-auto opacity-50 pointer-events-none z-10 object-contain" // 워터마크 스타일 (크기 및 투명도 조정)
                />

                <div className="bg-white w-full h-full min-h-screen"> {/* 메인 흰색 컨테이너, 그림자/테두리/둥근 모서리 제거, 화면 꽉 채우기 */}
                    {/* 사용자 ID 표시 */}
                    {isAuthReady && userId && (
                        <p className="text-sm text-gray-600 text-center mb-4 px-4 pt-4"> {/* 패딩 추가 */}
                            사용자 ID: <span className="font-mono break-all">{userId}</span>
                        </p>
                    )}

                    {/* 에러 메시지 */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center font-medium mx-4"> {/* 좌우 여백 추가 */}
                            <p>{error}</p>
                        </div>
                    )}

                    {/* 클립보드 복사 성공 메시지 */}
                    {showCopySuccessMessage && (
                        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in-up">
                            링크가 클립보드에 복사되었습니다!
                        </div>
                    )}

                    {/* 앱 모드에 따른 UI 렌더링 */}
                    {appMode === 'create' && (
                        <div className="animate-fade-in px-6 py-8 sm:px-8 sm:py-10 md:px-12 md:py-14"> {/* 내부 콘텐츠 패딩 추가 */}
                            {/* 시작 화면 UI/UX 개선 (참고 이미지 반영) */}
                            <div className="flex flex-col items-center justify-center mb-8">
                                {/* 상단바 (뒤로가기, 로고, 설정 아이콘) - 여기서는 간단히 로고 텍스트만 */}
                                <div className="w-full flex justify-between items-center mb-8">
                                    <span className="text-xl font-bold text-gray-800">
                                        {quizCreatorName ? `${quizCreatorName} 분석기` : '분석기'}
                                    </span>
                                    {/* 소리/자물쇠 아이콘 제거됨 */}
                                    {/* 아이콘 그룹 제거됨 */}
                                </div>

                                {/* 메인 타이틀 이미지 (사용자님이 제공한 이미지) */}
                                <img src="https://i.ibb.co/qM7wL9Zd/001-9.jpg" alt="나를 맞춰봐 TEST" className="w-full h-auto mx-auto mb-4 object-contain" />
                            </div>

                            <p className="text-lg text-center text-gray-700 mb-6">
                                퀴즈를 만들 당신의 이름을 입력해주세요.
                            </p>
                            <input
                                type="text"
                                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-800 mb-6 shadow-sm bg-white" // 입력창 색상: bg-white 명시
                                value={quizCreatorName}
                                onChange={(e) => setQuizCreatorName(e.target.value)}
                                placeholder="예: 수진"
                                maxLength={20}
                            />
                            {/* GPT에게 문구를 밖으로 빼내어 강조 (줄 바꿈 없이) */}
                            <p className="text-lg text-center text-gray-700 mb-6">
                                <span className="font-bold text-black">GPT에게</span> <span className="font-bold text-[#DB4455]">🖤내 성격과 성향, 좋아하는 거 싫어하는 걸 구분해서 1000자 내외로 분석해줘🖤</span>라고 요청한 후, 그 내용을 여기에 붙여넣어 주세요. 이 내용을 바탕으로 당신에 대한 퀴즈가 생성됩니다.
                            </p>
                            <textarea
                                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-800 resize-y min-h-[150px] mb-6 shadow-sm bg-white" // 입력창 색상: bg-white 명시
                                rows="7"
                                value={personalityDescription}
                                onChange={(e) => setPersonalityDescription(e.target.value)}
                                placeholder="예: 저는 민트 초코를 좋아하고, 좋아하는 게 있으면 밤을 샐 수 있을 정도로 열정을 가지고 있습니다. 원숭이에 대한 이상한 집착이 있으며 햄스터를 좋아합니다. 샤를 르끌레르는 제 남자친구입니다." // 플레이스홀더 문구 수정
                                maxLength={1000}
                            ></textarea>
                            <p className="text-right text-sm text-gray-500 mb-6">
                                {personalityDescription.length} / 1000자
                            </p>
                            <button
                                onClick={generateQuiz}
                                disabled={isLoading || !isAuthReady || !quizCreatorName.trim() || personalityDescription.length < 10 || personalityDescription.length > 1000}
                                className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-xl tracking-wide" // 버튼 디자인 변경
                            >
                                {isLoading ? (
                                    <span className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        퀴즈 생성 중...
                                    </span>
                                ) : '나를 맞춰봐 퀴즈 만들기'}
                            </button>
                        </div>
                    )}

                    {appMode === 'quizGenerated' && shareableLink && ( // 'quizGenerated' 모드 추가
                        <div className="animate-fade-in px-6 py-8 sm:px-8 sm:py-10 md:px-12 md:py-14 flex flex-col items-center text-center"> {/* 내부 콘텐츠 패딩 추가 및 중앙 정렬 */}
                            <h2 className="text-3xl font-bold text-[#DB4455] mb-4">
                                🎉 퀴즈가 성공적으로 생성되었습니다! 🎉
                            </h2>
                            <p className="text-lg text-gray-700 mb-6">
                                친구들에게 이 링크를 공유하여 나를 잘 알고있는지 시험해 보세요.
                            </p>
                            <div className="bg-gray-100 p-4 rounded-lg border border-gray-200 break-all mb-6 w-full max-w-md"> {/* 너비 제한 추가 */}
                                <p className="font-mono text-sm text-gray-800">{shareableLink}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-center gap-4 w-full max-w-md"> {/* 버튼 그룹 너비 제한 */}
                                <button
                                    onClick={copyShareLink}
                                    className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 text-lg flex-1"
                                >
                                    <svg className="w-6 h-6 mr-2 inline-block" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path>
                                    </svg>
                                    링크 복사
                                </button>
                                <button
                                    onClick={() => {
                                        setAppMode('test');
                                        setCurrentQuestionIndex(0); // 퀴즈 풀기 시작 시 첫 질문으로
                                        setTestTakerAnswers({}); // 답변 초기화
                                    }}
                                    className="flex items-center justify-center bg-black hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 text-lg flex-1"
                                >
                                    내 문제 풀어보기
                                </button>
                            </div>
                            <button
                                onClick={createNewTest} // 새로운 테스트 만들기 함수 호출
                                className="mt-8 w-full max-w-md bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:scale-105 text-lg"
                            >
                                새로운 테스트 만들기
                            </button>
                        </div>
                    )}

                    {appMode === 'test' && generatedQuiz.length > 0 && (
                        <div className="animate-fade-in px-6 py-8 sm:px-8 sm:py-10 md:px-12 md:py-14"> {/* 내부 콘텐츠 패딩 추가 */}
                            {/* 질문 화면 상단바 (뒤로가기 버튼 기능 추가) */}
                            <div className="w-full flex justify-between items-center mb-8">
                                <button
                                    onClick={() => {
                                        if (currentQuestionIndex > 0) {
                                            setCurrentQuestionIndex(prev => prev - 1); // 이전 질문으로 이동
                                        } else {
                                            // 첫 질문일 경우, create 모드로 돌아가 모든 상태 초기화
                                            createNewTest(); // 새로운 테스트 만들기 함수 호출
                                        }
                                    }}
                                    className="text-gray-600 hover:text-gray-800 p-2 rounded-full transition duration-200"
                                >
                                    {/* 뒤로가기 아이콘 */}
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <span className="text-xl font-bold text-gray-800">
                                    {quizCreatorName ? `${quizCreatorName} 분석기` : '분석기'} {/* 동적 이름 분석기 */}
                                </span>
                                {/* 소리/자물쇠 아이콘 제거됨 */}
                                {/* 아이콘 그룹 제거됨 */}
                            </div>

                            {/* 질문 번호 및 질문 */}
                            <p className="text-xl md:text-2xl font-bold text-center text-gray-900 mb-6">
                                Q{currentQuestionIndex + 1}. {generatedQuiz[currentQuestionIndex].question}
                            </p>
                            {/* 질문별 이미지 (사용자님이 제공한 이미지) 제거됨 */}
                            <div className="flex justify-center mb-6">
                                <img
                                    src="https://i.ibb.co/kVdsSm6B/002.png"
                                    alt="질문 관련 이미지"
                                    className="w-1/4 h-auto object-contain" // ✅ 크기 작게, 비율 유지
                                    style={{ boxShadow: 'none', backgroundColor: 'transparent' }} // ✅ 그림자 제거 + 배경 투명
                                />
                            </div>
                            <div className="space-y-4">
                                {generatedQuiz[currentQuestionIndex].options.map((option, optIndex) => (
                                    <label
                                        key={optIndex}
                                        className={`flex items-center cursor-pointer p-3 rounded-xl border-2 transition duration-200
                                                ${testTakerAnswers[currentQuestionIndex] === String(optIndex + 1) ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'}`}
                                    >
                                        <input
                                            type="radio"
                                            name={`question-${currentQuestionIndex}`}
                                            value={String(optIndex + 1)} // 1, 2, 3, 4로 값 설정
                                            checked={testTakerAnswers[currentQuestionIndex] === String(optIndex + 1)}
                                            onChange={(e) => handleAnswerChange(currentQuestionIndex, e.target.value)}
                                            className="form-radio h-5 w-5 text-purple-600 transition duration-150 ease-in-out"
                                        />
                                        <span className="ml-3 text-gray-800 text-base md:text-lg">
                                            {option} {/* 'a, b, c' 번호 제거 */}
                                        </span>
                                    </label>
                                ))}
                            </div>

                            {/* 다음/이전 버튼 */}
                            <div className="flex justify-between mt-8">
                                {currentQuestionIndex > 0 && (
                                    <button
                                        onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:scale-105 text-lg flex-1 mr-2"
                                    >
                                        이전
                                    </button>
                                )}
                                {currentQuestionIndex < generatedQuiz.length - 1 ? (
                                    <button
                                        onClick={() => {
                                            // 현재 질문에 답변했을 때만 다음으로 넘어가도록
                                            if (testTakerAnswers.hasOwnProperty(currentQuestionIndex)) {
                                                setError(''); // 오류 메시지 초기화
                                                setCurrentQuestionIndex(prev => prev + 1); // <-- 여기를 prev + 1로 수정
                                            } else {
                                                setError('현재 질문에 답변을 선택해주세요.');
                                            }
                                        }}
                                        disabled={!testTakerAnswers.hasOwnProperty(currentQuestionIndex)} // 현재 질문에 답해야 다음으로 넘어갈 수 있음
                                        className="bg-black hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-lg flex-1 ml-2" // 버튼 색상 변경
                                    >
                                        다음으로
                                    </button>
                                ) : (
                                    <button
                                        onClick={calculateCompatibility}
                                        disabled={Object.keys(testTakerAnswers).length !== generatedQuiz.length}
                                        className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-lg" // 버튼 색상 변경
                                    >
                                        점수 확인하기
                                    </button>
                                )}
                            </div>
                            {/* 내 테스트 만들기 버튼 추가 */}
                            <button
                                onClick={createNewTest}
                                className="mt-4 w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:scale-105 text-lg"
                            >
                                내 맞춤 테스트 만들기
                            </button>
                        </div>
                    )}

                    {appMode === 'result' && compatibilityScore !== null && (
                        <div className="animate-fade-in p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center text-center"> {/* 내부 콘텐츠 패딩 추가 및 중앙 정렬 */}
                            <h2 className="text-3xl font-bold text-[#DB4455] mb-4">당신과 {quizCreatorName || '이 사람'}은 얼마나 잘 맞을까요?</h2> {/* 색상 변경 */}
                            <p className="text-6xl font-extrabold text-[#DB4455] mb-6 drop-shadow-lg"> {/* 색상 변경 */}
                                {compatibilityScore}점!
                            </p>
                            <p className="text-xl text-gray-800 mb-8 font-medium">
                                {compatibilityMessage}
                            </p>

                            <div className="mt-8 pt-6 border-t border-gray-200 w-full"> {/* w-full 추가하여 공유 섹션도 중앙 정렬 */}
                                <h3 className="text-2xl font-bold text-black mb-4">이 테스트 공유하기</h3> {/* 글자색 검은색으로 변경 */}
                                <p className="text-md text-gray-700 mb-6">
                                    친구들에게 당신의 테스트를 공유하고 당신을 얼마나 아는지 확인해보세요!
                                </p>
                                <div className="flex flex-col sm:flex-row justify-center gap-4">
                                    <button
                                        onClick={copyShareLink}
                                        className="flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-xl shadow-xl shadow-md transition duration-300 ease-in-out transform hover:scale-105 text-lg"
                                    >
                                        <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path>
                                    </svg>
                                        링크 복사
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={createNewTest} // 새로운 테스트 만들기 함수 호출
                                className="mt-8 bg-black hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-xl shadow-md transition duration-300 ease-in-out transform hover:scale-105 text-lg"
                            >
                                내 맞춤 테스트 만들기
                            </button>
                        </div>
                    )}

                    {showResultModal && (
                        <Modal onClose={closeResultModal}>
                            <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">분석 결과!</h3>
                            <p className="text-5xl font-extrabold text-[#FC5230] mb-4 text-center">
                                {compatibilityScore}점!
                            </p>
                            <p className="text-lg text-gray-700 mb-6 text-center">
                                {compatibilityMessage}
                            </p>
                            <button
                                onClick={closeResultModal}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105 text-lg"
                            >
                                결과 확인하기
                            </button>
                        </Modal>
                    )}
                </div>
            </div>
        </ErrorBoundary>
    );
};

export default App;
