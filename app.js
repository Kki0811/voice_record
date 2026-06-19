let dbWords = [];       
let testQueue = [];     
let currentIdx = 0;     
let wrongWordsThisRound = []; 
let currentRoundOriginalWords = []; 
let customSelectedIds = [];
let hintTimer;

// 현재 문제에서 사용자가 임시로 선택한 정오답 상태를 기억하는 변수
let currentSelection = null; 

let mediaRecorder;
let audioChunks = [];
let currentBase64Audio = "";

// 탭 전환
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    
    if(tab === 'quiz') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('quiz-panel').classList.add('active');
        initQuizArea();
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('manage-panel').classList.add('active');
        loadWordList();
    }
}

// 초기화 가동
window.addEventListener('DOMContentLoaded', async () => {
    await initQuizArea();
});

async function initQuizArea() {
    dbWords = await localforage.getItem('wordbook') || [];
    document.getElementById('total-info').innerText = `현재 저장된 총 단어 수: ${dbWords.length}개`;
    
    customSelectedIds = []; 
    document.getElementById('word-search-input').value = "";
    renderSelectedChips();
    updateQuizDropdown();

    document.getElementById('setup-area').style.display = 'block';
    document.getElementById('quiz-area').style.display = 'none';
    document.getElementById('result-area').style.display = 'none';
}

// 데이터리스트 추천 목록 갱신
function updateQuizDropdown() {
    const datalist = document.getElementById('word-search-options');
    datalist.innerHTML = '';
    
    const sortedWords = [...dbWords].sort((a, b) => a.en.localeCompare(b.en));
    
    sortedWords.forEach(word => {
        if (!customSelectedIds.includes(word.id)) {
            const opt = document.createElement('option');
            opt.value = word.en; 
            opt.innerText = word.ko;
            opt.dataset.id = word.id;
            datalist.appendChild(opt);
        }
    });
}

// 실시간 검색 매칭 후 단어 추가
function handleWordSearchSelect() {
    const input = document.getElementById('word-search-input');
    const val = input.value.trim();
    if (!val) return;

    const options = document.querySelectorAll('#word-search-options option');
    let targetId = null;

    for (let opt of options) {
        if (opt.value.toLowerCase() === val.toLowerCase() || opt.innerText === val) {
            targetId = parseInt(opt.dataset.id);
            break;
        }
    }

    if (targetId && !customSelectedIds.includes(targetId)) {
        customSelectedIds.push(targetId);
        input.value = ""; 
        renderSelectedChips();
        updateQuizDropdown();
    }
}

// 고른 단어 취소
function removeSelectedWord(id) {
    customSelectedIds = customSelectedIds.filter(itemId => itemId !== id);
    renderSelectedChips();
    updateQuizDropdown();
}

// 고른 단어 카드식 UI 출력
function renderSelectedChips() {
    const container = document.getElementById('selected-words-container');
    if (customSelectedIds.length === 0) {
        container.innerHTML = '<span style="color: #94A3B8; font-size: 13px; width: 100%; text-align: center;">직접 선택한 단어가 없습니다.</span>';
        return;
    }

    container.innerHTML = '';
    customSelectedIds.forEach(id => {
        const word = dbWords.find(w => w.id === id);
        if (word) {
            const chip = document.createElement('span');
            chip.className = 'word-chip';
            chip.innerHTML = `${word.en} (${word.ko}) <span class="remove-btn" onclick="removeSelectedWord(${word.id})">✕</span>`;
            container.appendChild(chip);
        }
    });
}

// 퀴즈 시작 및 자동 출제 문제 조율
function startQuiz() {
    if (dbWords.length === 0) {
        alert("테스트할 단어가 없습니다. 단어를 먼저 등록해주세요!");
        switchTab('manage');
        return;
    }

    let inputCount = parseInt(document.getElementById('quiz-count').value) || 5;
    if (inputCount <= 0) inputCount = 5;
    
    let finalCount = Math.min(inputCount, dbWords.length);
    let chosenWords = dbWords.filter(word => customSelectedIds.includes(word.id));
    
    if (finalCount < chosenWords.length) {
        finalCount = chosenWords.length;
        document.getElementById('quiz-count').value = finalCount;
    }

    let remainingCount = finalCount - chosenWords.length;
    let otherWords = [];

    if (remainingCount > 0) {
        let scoredWords = dbWords
            .filter(word => !customSelectedIds.includes(word.id)) 
            .map(word => {
                let total = word.totalCount || 0;
                let wrong = word.wrongCount || 0;
                let wrongRate = total > 0 ? wrong / total : 0;
                let isNew = total === 0 ? 1 : 0;

                let priorityScore = (isNew ? 1.0 : wrongRate) + (Math.random() * 0.01);
                return { ...word, priorityScore };
            });

        scoredWords.sort((a, b) => b.priorityScore - a.priorityScore);
        otherWords = scoredWords.slice(0, remainingCount);
    }

    testQueue = [...chosenWords, ...otherWords].sort(() => Math.random() - 0.5);
    currentRoundOriginalWords = [...testQueue];
    wrongWordsThisRound = []; 
    currentIdx = 0;
    
    document.getElementById('setup-area').style.display = 'none';
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('quiz-area').style.display = 'block';
    showQuestion();
}

function startCurrentRoundAgain() {
    if (currentRoundOriginalWords.length === 0) return;
    testQueue = [...currentRoundOriginalWords];
    wrongWordsThisRound = []; 
    currentIdx = 0;
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('quiz-area').style.display = 'block';
    showQuestion();
}

function startWrongQuiz() {
    if (wrongWordsThisRound.length === 0) return;
    testQueue = [...wrongWordsThisRound];
    wrongWordsThisRound = []; 
    currentIdx = 0;
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('quiz-area').style.display = 'block';
    showQuestion();
}

// 문제 출제 (3초 잠금 장치 및 선택 상태 초기화)
function showQuestion() {
    let currentWord = testQueue[currentIdx];
    
    document.getElementById('progress-text').innerText = `[ ${currentIdx + 1} / ${testQueue.length} ]`;
    document.getElementById('word-target').innerText = currentWord.en;
    document.getElementById('hint-target').innerText = currentWord.ko;
    
    document.getElementById('hint-target').style.display = 'none';
    document.getElementById('ox-area').style.display = 'none';
    
    // 상태값 변수 및 다음 버튼 비활성화 초기화
    currentSelection = null;
    const nextBtn = document.getElementById('next-btn');
    nextBtn.disabled = true;
    nextBtn.innerText = "다음 문제로 ➡️";

    // OX 버튼 선택 디자인 초기화
    document.getElementById('btn-ox-correct').style.border = "none";
    document.getElementById('btn-ox-wrong').style.border = "none";
    document.getElementById('btn-ox-correct').style.opacity = "1";
    document.getElementById('btn-ox-wrong').style.opacity = "1";

    const hintBtn = document.getElementById('hint-btn');
    hintBtn.style.display = 'block';
    hintBtn.disabled = true; 
    hintBtn.innerText = "⏱️ 잠시 후 정답 확인 가능 (3초)";

    if (hintTimer) clearTimeout(hintTimer);

    hintTimer = setTimeout(() => {
        hintBtn.disabled = false;
        hintBtn.innerText = "👀 정답 확인하기";
    }, 3000);

    setTimeout(() => { playCurrentAudio(); }, 300);
}

function showHint() {
    if (hintTimer) clearTimeout(hintTimer);
    document.getElementById('hint-target').style.display = 'block';
    document.getElementById('hint-btn').style.display = 'none';
    document.getElementById('ox-area').style.display = 'flex';
}

// O / X 버튼 선택 시 임시 보관 및 디자인 변경
function selectScore(isCorrect) {
    currentSelection = isCorrect; 
    
    const nextBtn = document.getElementById('next-btn');
    nextBtn.disabled = false; // 다음 버튼 언락
    
    const correctBtn = document.getElementById('btn-ox-correct');
    const wrongBtn = document.getElementById('btn-ox-wrong');
    
    if (isCorrect) {
        correctBtn.style.opacity = "1";
        correctBtn.style.border = "3px solid #1E293B"; 
        wrongBtn.style.opacity = "0.4"; 
        wrongBtn.style.border = "none";
        nextBtn.innerText = "⭕ 맞음 반영하고 다음으로 ➡️";
    } else {
        wrongBtn.style.opacity = "1";
        wrongBtn.style.border = "3px solid #1E293B";
        correctBtn.style.opacity = "0.4";
        correctBtn.style.border = "none";
        nextBtn.innerText = "❌ 틀림 반영하고 다음으로 ➡️";
    }
}

// [다음 문제로] 버튼 클릭 시 확정 저장 후 이동
async function commitAndNext() {
    if (currentSelection === null) return; 

    let currentWord = testQueue[currentIdx];
    let targetIdx = dbWords.findIndex(w => w.id === currentWord.id);
    
    // 최종 확인 상태에서만 LocalForage 스탯을 올림
    if (targetIdx !== -1) {
        if (!dbWords[targetIdx].totalCount) dbWords[targetIdx].totalCount = 0;
        if (!dbWords[targetIdx].wrongCount) dbWords[targetIdx].wrongCount = 0;

        dbWords[targetIdx].totalCount += 1;
        if (currentSelection === false) {
            dbWords[targetIdx].wrongCount += 1;
        }
        await localforage.setItem('wordbook', dbWords);
    }

    // 이번 라운드 오답 목록 세팅
    if (currentSelection === false) {
        if (!wrongWordsThisRound.some(w => w.id === currentWord.id)) {
            wrongWordsThisRound.push(currentWord);
        }
    }

    // 다음 분기로 처리
    currentIdx++;
    if (currentIdx < testQueue.length) {
        showQuestion();
    } else {
        finishQuiz();
    }
}

// 퀴즈 결과 정산
function finishQuiz() {
    document.getElementById('quiz-area').style.display = 'none';
    document.getElementById('result-area').style.display = 'block';

    const totalTestCount = testQueue.length;
    const wrongCount = wrongWordsThisRound.length;
    const correctCount = totalTestCount - wrongCount;

    let summaryText = `총 ${totalTestCount}문제 중 ${correctCount}문제를 맞췄습니다!`;
    
    if (wrongCount > 0) {
        summaryText += `<br><span style="color: var(--danger-color); font-size:16px;">틀린 단어가 ${wrongCount}개 있습니다. 복습해볼까요?</span>`;
        document.getElementById('retry-wrong-btn').style.display = 'block';
        document.getElementById('retry-wrong-btn').innerText = `❌ 틀린 단어 (${wrongCount}개)만 다시 시험 치기`;
    } else {
        summaryText += `<br><span style="color: var(--success-color); font-size:16px;">💯 완벽해요! 모든 단어를 맞췄습니다! 👍</span>`;
        document.getElementById('retry-wrong-btn').style.display = 'none';
    }

    document.getElementById('result-summary').innerHTML = summaryText;
}

// 오디오 재생 시스템
function playCurrentAudio() {
    if (!testQueue[currentIdx]) return;
    let audioData = testQueue[currentIdx].audio;
    if(audioData) {
        let audio = new Audio(audioData);
        audio.play().catch(e => console.log("자동 재생 오디오 제한됨:", e));
    } else {
        let tts = new SpeechSynthesisUtterance(testQueue[currentIdx].en);
        tts.lang = 'en-US';
        window.speechSynthesis.speak(tts);
    }
}

// 등록 리스트 로드
async function loadWordList() {
    dbWords = await localforage.getItem('wordbook') || [];
    let tbody = document.getElementById('word-list-tbody');
    tbody.innerHTML = '';

    dbWords.forEach(word => {
        let total = word.totalCount || 0;
        let wrong = word.wrongCount || 0;
        let statsText = total === 0 ? 
            `<span class="status-badge badge-new">신규 단어</span>` : 
            `<span class="status-badge badge-review">오답률 ${Math.round((wrong/total)*100)}%</span> (${wrong}/${total}회)`;

        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${word.en}</strong><br>
                <span style="color:#4A5568;">${word.ko}</span>
            </td>
            <td>${statsText}</td>
            <td class="action-btns">
                <button class="btn-edit" onclick="editWord(${word.id})">수정</button>
                <button class="btn-delete" onclick="deleteWord(${word.id})">삭제</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 새 단어 저장 / 수정
async function saveWord() {
    let en = document.getElementById('word-en').value.trim();
    let ko = document.getElementById('word-ko').value.trim();
    let editId = document.getElementById('edit-id').value;

    if(!en || !ko) {
        alert("영어 단어와 한글 뜻을 모두 적어주세요!");
        return;
    }

    if(editId) {
        let targetIdx = dbWords.findIndex(w => w.id == editId);
        if(targetIdx !== -1) {
            dbWords[targetIdx].en = en;
            dbWords[targetIdx].ko = ko;
            if(currentBase64Audio) dbWords[targetIdx].audio = currentBase64Audio;
        }
    } else {
        let newWord = {
            id: Date.now(),
            en: en,
            ko: ko,
            audio: currentBase64Audio,
            totalCount: 0,
            wrongCount: 0
        };
        dbWords.push(newWord);
    }

    await localforage.setItem('wordbook', dbWords);
    alert(editId ? "단어가 수정되었습니다." : "새로운 단어가 등록되었습니다.");
    resetForm();
    loadWordList();
}

// 단어 수정 불러오기
function editWord(id) {
    let word = dbWords.find(w => w.id == id);
    if(!word) return;

    document.getElementById('edit-id').value = word.id;
    document.getElementById('word-en').value = word.en;
    document.getElementById('word-ko').value = word.ko;
    document.getElementById('form-title').innerText = "⚙️ 단어 수정 모드";
    document.getElementById('submit-btn').innerText = "✅ 수정 완료하기";
    document.getElementById('cancel-btn').style.display = "block";
    
    currentBase64Audio = word.audio || "";
    document.getElementById('play-recorded-btn').disabled = !currentBase64Audio;
    
    window.scrollTo({top: 0, behavior: 'smooth'});
}

// 단어 삭제
async function deleteWord(id) {
    if(confirm("정말 이 단어를 삭제하시겠습니까? 데이터가 영구히 제거됩니다.")) {
        dbWords = dbWords.filter(w => w.id != id);
        await localforage.setItem('wordbook', dbWords);
        loadWordList();
    }
}

function resetForm() {
    document.getElementById('edit-id').value = "";
    document.getElementById('word-en').value = "";
    document.getElementById('word-ko').value = "";
    document.getElementById('form-title').innerText = "📝 새 단어 추가하기";
    document.getElementById('submit-btn').innerText = "✅ 단어 저장하기";
    document.getElementById('cancel-btn').style.display = "none";
    document.getElementById('play-recorded-btn').disabled = true;
    currentBase64Audio = "";
}

// 목소리 녹음 시스템
async function toggleRecording() {
    let btn = document.getElementById('record-btn');
    
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                let audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                let reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    currentBase64Audio = reader.result;
                    document.getElementById('play-recorded-btn').disabled = false;
                };
            };
            
            mediaRecorder.start();
            btn.innerText = "⏹️ 녹음 중지";
            btn.style.background = "var(--danger-color)";
        } catch (err) {
            alert("마이크 연결 실패: 권한 허용을 확인하세요.");
        }
    } else {
        mediaRecorder.stop();
        btn.innerText = "🔴 녹음 시작";
        btn.style.background = "#4A5568";
    }
}

function playRecorded() {
    if(currentBase64Audio) new Audio(currentBase64Audio).play();
}

// 백업 내보내기
async function backupData() {
    const words = await localforage.getItem('wordbook') || [];
    if (words.length === 0) {
        alert("백업할 단어가 없습니다.");
        return;
    }
    try {
        const dataStr = JSON.stringify(words, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const today = new Date().toISOString().slice(0, 10);
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `wordbook_backup_${today}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        alert("백업 실패: " + error.message);
    }
}

function triggerLoadFile() {
    document.getElementById('backup-file-input').click();
}

// 백업 가져오기 복원
function loadBackupData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedWords = JSON.parse(e.target.result);
            if (!Array.isArray(importedWords)) throw new Error("올바른 형식이 아닙니다.");

            if (confirm(`선택한 파일에서 ${importedWords.length}개의 단어를 불러오시겠습니까?\n\n(주의: 기존 데이터는 완전히 지워집니다.)`)) {
                await localforage.setItem('wordbook', importedWords);
                alert("🎉 데이터 복원이 완료되었습니다!");
                dbWords = importedWords;
                loadWordList();
            }
        } catch (error) {
            alert("파일 읽기 오류: " + error.message);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}
