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
    let latestSearchItems = [];

    const stripHtml = (value) => value.replace(/<[^>]*>/g, '');
    const decodeHtml = (value) => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = value;
        return textarea.value;
    };
    const cleanText = (value) => decodeHtml(stripHtml(value || ''));
    const normalizeSpaces = (value) => value.replace(/\s+/g, ' ').trim();

    const removeEmojis = (value) => value.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
    const removeHashtags = (value) => value.replace(/#[\p{L}0-9_]+/gu, '');

    const isMostlyHashtags = (value) => {
        const tags = (value.match(/#[\p{L}0-9_]+/gu) || []).length;
        const tokens = value.trim().split(/\s+/).filter(Boolean).length;
        return tokens > 0 && tags / tokens > 0.5;
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

            const title = cleanText(item.title);
            const bloggerName = cleanText(item.bloggername);
            const postDate = cleanText(item.postdate);
            const summary = item.cleanedSummary || '정리된 참고문장을 만들지 못했습니다.';

            listItem.innerHTML = `
                <a class="result-title" href="${item.link}" target="_blank" rel="noopener noreferrer">${title}</a>
                <div class="result-meta">
                    <span>${bloggerName}</span>
                    <span>${postDate}</span>
                </div>
                <p class="result-desc">${summary}</p>
            `;

            list.appendChild(listItem);
        });

        searchResults.innerHTML = '';
        searchResults.appendChild(list);
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
            latestSearchItems = [];
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
            const cleanedItems = prepareSearchItems(items);
            latestSearchItems = cleanedItems;
            setStatus(`${cleanedItems.length}건의 참고 결과를 정리했습니다.`, false);
            renderResults(cleanedItems);
        } catch (error) {
            setStatus('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', true);
            searchResults.innerHTML = '';
            latestSearchItems = [];
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
                const title = cleanText(item.cleanedTitle || item.title || '');
                const summary = cleanText(item.cleanedSummary || '');
                return `${title}. ${summary}`;
            })
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

    const extractTopicHints = (items) => {
        const categories = {
            parking: /(주차|주차장|발렛|주차공간|parking)/i,
            waiting: /(웨이팅|대기|줄|예약|캐치테이블|오픈런)/i,
            mood: /(분위기|인테리어|좌석|테이블|조용|넓|아늑|뷰)/i,
            menu: /(메뉴|시그니처|대표|맛|식감|소스|디저트|음료|양|간)/i,
            price: /(가격|가성비|만원|원대|비용|세트)/i
        };

        const hints = {
            parking: [],
            waiting: [],
            mood: [],
            menu: [],
            price: []
        };

        items.slice(0, 5).forEach((item) => {
            const sentence = `${cleanText(item.cleanedSummary || '')}`.trim();
            Object.keys(categories).forEach((key) => {
                if (sentence && categories[key].test(sentence)) {
                    hints[key].push(sentence);
                }
            });
        });

        return hints;
    };

    const oneLine = (text, fallback) => {
        const cleaned = normalizeSpaces(text || '');
        return cleaned || fallback;
    };

    const sanitizeOutput = (text) => {
        let output = text.replace(/#[\p{L}0-9_]+/gu, '');
        output = output.replace(/[|/]+/g, ' ');
        output = output.replace(/\.{2,}|…+/g, '.');
        output = output.replace(/([!?.,])\1{1,}/g, '$1');
        output = normalizeSpaces(output.replace(/\n{3,}/g, '\n\n'));

        const sentences = output.split(/(?<=[.!?])\s+/);
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

        return normalizeSpaces(deduped.join(' '));
    };

    const buildParagraphDraft = (items, reviewText, keyword) => {
        const memo = oneLine(reviewText, '직접 먹으면서 느낀 점을 중심으로 적었습니다.');
        const topic = oneLine(keyword, '방문');
        const hints = extractTopicHints(items);
        const keywords = extractKeywords(items, topic);

        const introHint = keywords.length ? `${keywords.slice(0, 3).join(', ')} 관련 후기를 살짝 보고 방문했습니다.` : '간단히 후기를 훑어보고 방문했습니다.';

        const moodHint = oneLine(hints.mood[0], '매장은 생각보다 조용했고, 자리 간격이 너무 답답하진 않았어요.');
        const menuHint = oneLine(hints.menu[0], '음식 간이 세지 않고 편하게 먹기 좋은 편이었습니다.');
        const waitHint = oneLine(hints.waiting[0], '피크 타임에는 대기 가능성이 있어 살짝 여유 있게 움직이는 게 좋겠어요.');
        const parkingHint = oneLine(hints.parking[0], '차를 가져갈 경우 주변 주차 가능 여부를 미리 확인하는 편이 안전합니다.');
        const priceHint = oneLine(hints.price[0], '가격대는 메뉴 선택에 따라 체감이 달라졌습니다.');

        const title = `${topic} 방문 후기`;

        const body = [
            `한줄요약\n가볍게 들러서 편하게 먹고 나온 방문이었습니다.`,
            `방문동기\n${introHint}\n요즘은 식사 시간이 길지 않아도 만족도가 괜찮은 곳을 찾고 있어서 이번에 들렀습니다.`,
            `매장분위기/좌석\n${moodHint}\n혼자 와도 부담 없고, 두세 명이 앉아 식사하기에도 무난한 느낌이었어요.`,
            `메뉴/맛\n${menuHint}\n${memo}\n양이나 간은 과하지 않아서 천천히 먹어도 부담이 적었습니다.`,
            `팁(주차/웨이팅/가격대)\n${waitHint}\n${parkingHint}\n${priceHint}\n저는 방문 전에 간단히 동선을 확인하니 훨씬 편했어요.`,
            `총평\n크게 과장하지 않고 있는 그대로 즐길 수 있는 곳이었고, 편하게 한 끼 해결하고 싶을 때 다시 들를 것 같습니다.`
        ].join('\n\n');

        const hashtagBase = keywords.slice(0, 4).map((word) => `#${word}`).join(' ');
        const hashtags = hashtagBase ? `\n\n${hashtagBase}` : '';

        return `${title}\n\n${body}${hashtags}`;
    };

    const updateDraft = async () => {
        const reviewText = userReview.value;
        if (!latestSearchItems.length) {
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
            const draft = buildParagraphDraft(latestSearchItems, reviewText, searchInput.value.trim());
            const sanitized = sanitizeOutput(draft);
            draftOutput.textContent = sanitized;
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
