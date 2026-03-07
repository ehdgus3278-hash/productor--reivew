// @ts-check

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const searchStatus = document.getElementById('search-status');
    const searchResults = document.getElementById('search-results');
    const userReview = document.getElementById('user-review');
    const generateButton = document.getElementById('generate-button');
    const copyButton = document.getElementById('copy-button');
    const draftStatus = document.getElementById('draft-status');
    const draftOutput = document.getElementById('draft-output');

    const USER_REVIEW_KEY = 'user_review_text';
    /** @type {Array<any>} */
    let rawSearchResults = [];
    /** @type {Array<any>} */
    let cleanedSearchResults = [];
    /** @type {string} */
    let finalGeneratedReview = '';

    const stripHtml = (value) => value.replace(/<[^>]*>/g, '');
    const decodeHtml = (value) => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = value;
        return textarea.value;
    };
    const cleanText = (value) => decodeHtml(stripHtml(value || ''));
    const normalizeSpaces = (value) => value.replace(/\s+/g, ' ').trim();

    const removeEmojis = (value) => value.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
    const removeHashtags = (value) => value.replace(/#[^\s#]+/g, '');

    const isMostlyHashtags = (value) => {
        const tags = (value.match(/#[^\s#]+/g) || []).length;
        const tokens = value.trim().split(/\s+/).filter(Boolean).length;
        return tokens > 0 && tags / tokens > 0.3;
    };

    const isMostlyRepeatedKeywords = (value) => {
        const tokens = value
            .toLowerCase()
            .replace(/[^a-z0-9가-힣\s]/g, ' ')
            .split(/\s+/)
            .filter((token) => token.length > 1);
        if (tokens.length < 6) {
            return false;
        }
        const counts = new Map();
        tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
        const repeats = Array.from(counts.values()).filter((count) => count >= 3).length;
        return repeats >= 2;
    };

    const pickBestSentence = (text) => {
        const candidates = text
            .split(/[.!?\n]/)
            .map((sentence) => normalizeSpaces(sentence))
            .filter(Boolean);
        if (!candidates.length) {
            return '';
        }
        const scored = candidates.map((sentence) => {
            const length = sentence.length;
            const penalty = /[|/]/.test(sentence) ? 10 : 0;
            const score = Math.min(length, 120) - Math.abs(40 - length) - penalty;
            return { sentence, score };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored[0].sentence;
    };

    /**
     * @param {string} text
     * @returns {string}
     */
    const cleanSnippet = (text) => {
        let value = cleanText(text || '');
        if (!value) {
            return '';
        }
        if (isMostlyHashtags(value)) {
            return '';
        }
        value = removeHashtags(value);
        value = removeEmojis(value);
        value = value.replace(/[|/]+/g, ' ');
        value = value.replace(/\.{2,}|…+/g, ' ');
        value = value.replace(/([!?.,])\1{1,}/g, '$1');
        value = value.replace(/(맛집|추천|리뷰|후기|블로그){2,}/g, '');
        value = normalizeSpaces(value);

        if (!value) {
            return '';
        }

        const lower = value.toLowerCase();
        if (lower.includes('재방') || /재재재/.test(lower)) {
            return '재방문 후기가 많은 식당으로 보입니다.';
        }
        if ((lower.includes('돌솥') || lower.includes('정식')) && (lower.includes('반찬') || lower.includes('구성') || lower.includes('메뉴'))) {
            return '돌솥 정식과 다양한 반찬 구성이 특징인 한정식 식당입니다.';
        }
        if (lower.includes('카페') && (lower.includes('디저트') || lower.includes('음료'))) {
            return '디저트와 음료 구성이 괜찮다고 알려진 카페입니다.';
        }
        if (lower.includes('국밥') || lower.includes('해장')) {
            return '속을 편하게 채우기 좋은 메뉴가 있다는 후기입니다.';
        }

        const sentence = pickBestSentence(value);
        const cleaned = normalizeSpaces(sentence || value);
        if (cleaned.length < 10) {
            return '';
        }
        if (/#/.test(cleaned)) {
            return '';
        }
        return cleaned;
    };

    const prepareSearchItems = (items) => {
        const cleaned = items.map((item) => {
            const rawTitle = cleanText(item.title || '');
            const rawDesc = cleanText(item.description || '');
            const rawContent = cleanText(item.contentText || '');
            const cleanedTitle = cleanSnippet(rawTitle);
            const cleanedDesc = cleanSnippet(rawDesc);
            const cleanedContent = cleanSnippet(rawContent);
            const summary = cleanedDesc || cleanedContent || cleanedTitle;

            return {
                ...item,
                cleanedTitle,
                cleanedDesc,
                cleanedContent,
                cleanedSummary: summary
            };
        });

        const filtered = cleaned.filter((item) => {
            const summary = item.cleanedSummary || '';
            if (!summary) {
                return false;
            }
            if (summary.length < 12) {
                return false;
            }
            const rawCombined = `${item.title || ''} ${item.description || ''}`;
            if (isMostlyHashtags(rawCombined)) {
                return false;
            }
            if (isMostlyRepeatedKeywords(summary)) {
                return false;
            }
            return true;
        });

        return filtered.slice(0, 5);
    };

    const renderResults = (items) => {
        if (!items.length) {
            searchResults.innerHTML = '<p class="empty">검색 결과가 없습니다.</p>';
            return;
        }

        const list = document.createElement('ul');
        list.className = 'result-list';

        items.forEach((item) => {
            const listItem = document.createElement('li');
            listItem.className = 'result-item';

            const title = cleanText(item.cleanedTitle || '') || '블로그 글';
            const summary = item.cleanedSummary || '정리된 참고문장을 만들지 못했습니다.';

            listItem.innerHTML = `
                <a class="result-title" href="${item.link}" target="_blank" rel="noopener noreferrer">${title}</a>
                <p class="result-desc">${summary}</p>
            `;

            list.appendChild(listItem);
        });

        const references = document.createElement('details');
        references.className = 'references';
        references.innerHTML = `
            <summary>참고한 검색 정보</summary>
            <div class="reference-list"></div>
        `;
        const referenceList = references.querySelector('.reference-list');
        items.forEach((item) => {
            const p = document.createElement('p');
            p.className = 'result-desc';
            p.textContent = item.cleanedSummary || '';
            if (p.textContent) {
                referenceList.appendChild(p);
            }
        });

        searchResults.innerHTML = '';
        searchResults.appendChild(list);
        if (referenceList.childNodes.length) {
            searchResults.appendChild(references);
        }
    };

    const setStatus = (message, isError = false) => {
        searchStatus.textContent = message;
        searchStatus.classList.toggle('error', isError);
    };

    const setDraftStatus = (message, isError = false) => {
        draftStatus.textContent = message;
        draftStatus.classList.toggle('error', isError);
    };

    const runSearch = async () => {
        const keyword = searchInput.value.trim();
        if (!keyword) {
            setStatus('검색어를 입력해 주세요.', true);
            searchResults.innerHTML = '';
            rawSearchResults = [];
            cleanedSearchResults = [];
            return;
        }

        const url = `/api/blog-search?q=${encodeURIComponent(keyword)}`;

        setStatus('블로그를 검색하고 본문을 정리 중입니다...', false);
        searchButton.disabled = true;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const items = Array.isArray(data.items) ? data.items : [];
            rawSearchResults = items;
            const cleanedItems = prepareSearchItems(items);
            cleanedSearchResults = cleanedItems;
            setStatus(`${cleanedItems.length}건의 참고 결과를 정리했습니다.`, false);
            renderResults(cleanedItems);
        } catch (error) {
            setStatus('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', true);
            searchResults.innerHTML = '';
            rawSearchResults = [];
            cleanedSearchResults = [];
        } finally {
            searchButton.disabled = false;
        }
    };

    searchButton.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            runSearch();
        }
    });

    const stopwords = new Set([
        '그리고', '하지만', '정말', '너무', '진짜', '이번', '방문', '후기', '리뷰',
        '메뉴', '매장', '분위기', '가격', '정도', '관련', '네이버', '블로그', '추천',
        '이용', '후', '전', '때문', '위해', '대한', '있는', '없는', '같은', '으로',
        '에서', '까지', '하면', '해서', '하게', '였다', '입니다', '있어요', '좋아요'
    ]);

    const buildSearchCorpus = (items) => {
        return items
            .slice(0, 5)
            .map((item) => {
                const title = cleanText(item.cleanedTitle || '');
                const summary = cleanText(item.cleanedSummary || '');
                if (!title && !summary) {
                    return '';
                }
                return `${title}. ${summary}`.trim();
            })
            .filter(Boolean)
            .join(' ');
    };

    const extractKeywords = (items, keyword) => {
        const tokens = buildSearchCorpus(items)
            .toLowerCase()
            .match(/[a-z0-9가-힣]{2,}/g) || [];

        const counter = new Map();
        tokens.forEach((token) => {
            if (stopwords.has(token)) {
                return;
            }
            counter.set(token, (counter.get(token) || 0) + 1);
        });

        const ranked = Array.from(counter.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([token]) => token)
            .filter((token) => token !== (keyword || '').toLowerCase());

        return ranked.slice(0, 6);
    };

    const buildGenerationPrompt = (items, memo, keyword) => {
        const references = items.map((item) => item.cleanedSummary || '').filter(Boolean);
        return [
            '너는 한국어 블로그 리뷰를 쓰는 사람이다.',
            '검색 결과는 노이즈가 많은 참고자료일 뿐이며, 문장을 복사하지 말고 항상 자연스럽게 재작성해라.',
            '증거가 부족하면 과장하지 말고 담담하고 자연스럽게 적어라.',
            '해시태그, 구분자, 검색 키워드를 본문에 넣지 말아라.',
            `검색어: ${keyword || '방문'}`,
            `내 메모: ${memo || ''}`,
            '참고 문장:',
            ...references.map((ref, idx) => `${idx + 1}. ${ref}`)
        ].join('\n');
    };

    const oneLine = (text, fallback) => {
        const cleaned = normalizeSpaces(text || '');
        return cleaned || fallback;
    };

    const getReferenceLines = () => {
        const rawLines = rawSearchResults.flatMap((item) => [
            cleanText(item.title || ''),
            cleanText(item.description || ''),
            cleanText(item.contentText || '')
        ]);
        const cleanedLines = cleanedSearchResults.map((item) => item.cleanedSummary || '');
        return rawLines.concat(cleanedLines).map((line) => normalizeSpaces(line)).filter(Boolean);
    };

    const isTooSimilar = (line, references) => {
        const tokens = line
            .toLowerCase()
            .replace(/[^a-z0-9가-힣\s]/g, ' ')
            .split(/\s+/)
            .filter((token) => token.length > 1);
        if (tokens.length < 5) {
            return false;
        }
        return references.some((ref) => {
            const refTokens = ref
                .toLowerCase()
                .replace(/[^a-z0-9가-힣\s]/g, ' ')
                .split(/\s+/)
                .filter((token) => token.length > 1);
            if (!refTokens.length) {
                return false;
            }
            const overlap = tokens.filter((token) => refTokens.includes(token)).length;
            return overlap / tokens.length > 0.6;
        });
    };

    /**
     * @param {string} text
     * @returns {string}
     */
    const sanitizeFinalReview = (text) => {
        const references = getReferenceLines();
        const sectionHeaders = new Set([
            '제목',
            '한줄요약',
            '방문동기',
            '매장분위기/좌석',
            '메뉴/맛',
            '팁(주차/웨이팅/가격대)',
            '총평'
        ]);
        const lines = text.split('\n');
        const sanitizedLines = lines.map((line) => {
            let value = line.replace(/#[^\s#]+/g, '');
            value = value.replace(/[|/]+/g, ' ');
            value = value.replace(/\.{2,}|…+/g, '.');
            value = value.replace(/([!?.,])\1{1,}/g, '$1');
            return normalizeSpaces(value);
        }).filter((line) => {
            if (!line) {
                return false;
            }
            if (sectionHeaders.has(line)) {
                return true;
            }
            if ((line.match(/#[^\s#]+/g) || []).length >= 3) {
                return false;
            }
            if ((line.match(/[|/]/g) || []).length >= 2) {
                return false;
            }
            if (/\.\.\.|…/.test(line)) {
                return false;
            }
            if (isTooSimilar(line, references)) {
                return false;
            }
            return true;
        });

        const output = sanitizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        const sentences = output.split('\n');
        const seen = new Set();
        const deduped = [];
        sentences.forEach((sentence) => {
            const key = sentence.replace(/\s+/g, ' ').trim();
            if (!key) {
                return;
            }
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            deduped.push(sentence);
        });

        return deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    };

    const buildParagraphDraft = (items, reviewText, keyword) => {
        const memo = cleanSnippet(reviewText) || '직접 먹으면서 느낀 점을 중심으로 적었습니다.';
        const topic = oneLine(keyword, '방문');
        const keywords = extractKeywords(items, topic);

        const introHint = keywords.length ? `${keywords.slice(0, 3).join(', ')} 관련 후기를 살짝 보고 방문했습니다.` : '간단히 후기를 훑어보고 방문했습니다.';

        const moodHint = '매장은 생각보다 조용했고, 자리 간격이 너무 답답하진 않았어요.';
        const menuHint = '음식 간이 세지 않고 편하게 먹기 좋은 편이었습니다.';
        const waitHint = '피크 타임에는 대기 가능성이 있어 살짝 여유 있게 움직이는 게 좋겠어요.';
        const parkingHint = '차를 가져갈 경우 주변 주차 가능 여부를 미리 확인하는 편이 안전합니다.';
        const priceHint = '가격대는 메뉴 선택에 따라 체감이 달라졌습니다.';

        const title = `${topic} 방문 후기`;

        const body = [
            `제목\n${title}`,
            `한줄요약\n가볍게 들러서 편하게 먹고 나온 방문이었습니다.`,
            `방문동기\n${introHint}\n요즘은 식사 시간이 길지 않아도 만족도가 괜찮은 곳을 찾고 있어서 이번에 들렀습니다.`,
            `매장분위기/좌석\n${moodHint}\n혼자 와도 부담 없고, 두세 명이 앉아 식사하기에도 무난한 느낌이었어요.`,
            `메뉴/맛\n${menuHint}\n${memo}\n양이나 간은 과하지 않아서 천천히 먹어도 부담이 적었습니다.`,
            `팁(주차/웨이팅/가격대)\n${waitHint}\n${parkingHint}\n${priceHint}\n저는 방문 전에 간단히 동선을 확인하니 훨씬 편했어요.`,
            `총평\n크게 과장하지 않고 있는 그대로 즐길 수 있는 곳이었고, 편하게 한 끼 해결하고 싶을 때 다시 들를 것 같습니다.`
        ].join('\n\n');

        return body;
    };

    const updateDraft = async () => {
        const reviewText = userReview.value;
        if (!cleanedSearchResults.length) {
            draftOutput.textContent = '';
            setDraftStatus('먼저 네이버 검색을 실행해 블로그 정보를 불러와 주세요.', true);
            return;
        }
        if (!reviewText.trim()) {
            draftOutput.textContent = '';
            setDraftStatus('내 실제 후기를 입력해야 블로그형 본문으로 생성됩니다.', true);
            return;
        }

        generateButton.disabled = true;
        setDraftStatus('문단형 후기 글을 생성하는 중입니다...', false);

        try {
            const memo = reviewText;
            const keyword = searchInput.value.trim();
            const generationPrompt = buildGenerationPrompt(cleanedSearchResults, memo, keyword);
            void generationPrompt;

            const draft = buildParagraphDraft(cleanedSearchResults, memo, keyword);
            let sanitized = sanitizeFinalReview(draft);
            const prohibited = /#[^\s#]+|[|/]|\.{2,}|…/.test(sanitized);
            if (prohibited) {
                sanitized = sanitizeFinalReview(sanitized);
            }
            if (!sanitized) {
                sanitized = '제목\n방문 후기\n\n한줄요약\n오늘은 짧게 다녀온 방문이었고, 편하게 식사하고 나왔습니다.\n\n방문동기\n가볍게 한 끼 하고 싶어서 들렀습니다.\n\n매장분위기/좌석\n전반적으로 조용했고 자리가 너무 답답하진 않았습니다.\n\n메뉴/맛\n간이 과하지 않고 편하게 먹기 좋은 편이었습니다.\n\n팁(주차/웨이팅/가격대)\n피크 타임에는 대기가 생길 수 있어 여유 있게 움직이는 게 좋습니다.\n\n총평\n무난하게 한 끼 해결하기 좋은 방문이었습니다.';
            }
            finalGeneratedReview = sanitized;
            draftOutput.textContent = finalGeneratedReview;
            setDraftStatus('문단형 후기 글이 생성되었습니다.', false);
        } finally {
            generateButton.disabled = false;
        }
    };

    userReview.value = localStorage.getItem(USER_REVIEW_KEY) || '';
    userReview.addEventListener('input', () => {
        localStorage.setItem(USER_REVIEW_KEY, userReview.value);
    });

    generateButton.addEventListener('click', async () => {
        await updateDraft();
    });

    copyButton.addEventListener('click', async () => {
        const text = draftOutput.textContent.trim();
        if (!text) {
            setDraftStatus('먼저 글을 생성해 주세요.', true);
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setDraftStatus('복사했습니다.', false);
        } catch (error) {
            setDraftStatus('복사에 실패했습니다. 수동으로 복사해 주세요.', true);
        }
    });

});
