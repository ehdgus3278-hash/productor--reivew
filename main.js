class ReviewCard extends HTMLElement {
    constructor() {
        super();
        const template = document.getElementById('review-card-template').content;
        this.attachShadow({ mode: 'open' }).appendChild(template.cloneNode(true));
    }

    set review(review) {
        this.shadowRoot.querySelector('a').href = review.url;
        this.shadowRoot.querySelector('a').textContent = review.url;
        this.shadowRoot.querySelector('span').textContent = review.rating;
        this.shadowRoot.querySelectorAll('p')[2].textContent = review.text;
    }
}

customElements.define('review-card', ReviewCard);

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
    const reviewForm = document.getElementById('review-form');
    const reviewsContainer = document.getElementById('reviews-container');

    const USER_REVIEW_KEY = 'user_review_text';
    let latestSearchItems = [];

    const stripHtml = (value) => value.replace(/<[^>]*>/g, '');
    const decodeHtml = (value) => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = value;
        return textarea.value;
    };
    const cleanText = (value) => decodeHtml(stripHtml(value || ''));

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
            const description = cleanText(item.description);
            const bloggerName = cleanText(item.bloggername);
            const postDate = cleanText(item.postdate);

            listItem.innerHTML = `
                <a class="result-title" href="${item.link}" target="_blank" rel="noopener noreferrer">${title}</a>
                <div class="result-meta">
                    <span>${bloggerName}</span>
                    <span>${postDate}</span>
                </div>
                <p class="result-desc">${description}</p>
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

        const url = `https://naver-search-proxy.ehdgus3278.workers.dev/search?q=${encodeURIComponent(keyword)}&display=10&start=1&sort=sim`;

        setStatus('로딩 중...', false);
        searchButton.disabled = true;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const items = Array.isArray(data.items) ? data.items : [];
            latestSearchItems = items;
            setStatus(`${items.length}건의 결과를 찾았습니다.`, false);
            renderResults(items);
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
            .slice(0, 10)
            .map((item) => {
                const title = cleanText(item.title);
                const desc = cleanText(item.description);
                const date = cleanText(item.postdate);
                return `${title}. ${desc}. ${date}`;
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

        return ranked.slice(0, 8);
    };

    const extractTopicHints = (items) => {
        const categories = {
            parking: /(주차|주차장|발렛|주차공간|parking)/i,
            waiting: /(웨이팅|대기|줄|예약|캐치테이블|오픈런)/i,
            mood: /(분위기|인테리어|좌석|테이블|조용|넓|아늑|뷰)/i,
            menu: /(메뉴|시그니처|대표|맛|식감|소스|디저트|음료|양)/i,
            price: /(가격|가성비|만원|원대|비용|세트)/i
        };

        const hints = {
            parking: [],
            waiting: [],
            mood: [],
            menu: [],
            price: []
        };

        items.slice(0, 10).forEach((item) => {
            const sentence = `${cleanText(item.title)} ${cleanText(item.description)}`.trim();
            Object.keys(categories).forEach((key) => {
                if (categories[key].test(sentence)) {
                    hints[key].push(sentence);
                }
            });
        });

        return hints;
    };

    const oneLine = (text, fallback) => {
        const cleaned = (text || '')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned || fallback;
    };

    const fitLength = (body, min = 1200, max = 2000) => {
        let result = body.trim();
        const extender = '개인적으로는 한 번의 방문으로 단정하기보다, 시간대와 동행 구성에 따라 체감이 달라질 수 있다는 점을 함께 고려하면 판단이 더 정확해졌습니다.';
        while (result.length < min) {
            result += `\n${extender}`;
            if (result.length > max) {
                break;
            }
        }
        if (result.length > max) {
            result = result.slice(0, max).trim();
            if (!/[.!?]$/.test(result)) {
                result += '.';
            }
        }
        return result;
    };

    const buildParagraphDraft = (items, reviewText, keyword) => {
        const memo = oneLine(reviewText, '');
        const topic = oneLine(keyword, '방문');
        const hints = extractTopicHints(items);
        const keywords = extractKeywords(items, topic);

        const keywordText = keywords.length
            ? `${keywords.slice(0, 4).join(', ')} 같은 키워드를 중심으로 동선을 잡았습니다.`
            : '동선과 주문 순서를 먼저 정리해두고 움직였습니다.';

        const moodHint = oneLine(hints.mood[0], '매장 내부는 좌석 간격이 답답하지 않고 회전이 비교적 빠른 편이라 식사 흐름이 끊기지 않았습니다.');
        const menuHint = oneLine(hints.menu[0], '대표 메뉴를 먼저 주문하고 취향에 맞춰 사이드를 추가하니 전체 밸런스가 안정적으로 맞았습니다.');
        const waitHint = oneLine(hints.waiting[0], '피크 시간대에는 대기 변수가 생길 수 있어 방문 시간을 조금 앞당기는 편이 편했습니다.');
        const parkingHint = oneLine(hints.parking[0], '차를 이용한다면 근처 주차 가능 구역을 먼저 확인해두는 편이 이동 스트레스를 줄이는 데 도움이 됩니다.');
        const priceHint = oneLine(hints.price[0], '가격대는 구성에 따라 차이가 있어 1인 기준 예산을 먼저 정해두면 주문이 훨씬 수월했습니다.');

        const title = `${topic} 솔직 방문후기`;

        const body = [
            `한줄요약\n한 번에 강하게 인상적인 포인트가 있는 곳이라기보다, 기본기가 안정적이라 재방문을 고민하게 되는 타입이었습니다.\n메뉴 선택과 방문 타이밍만 맞추면 만족도가 올라가는 구조였고, 실제로 저는 예상했던 흐름대로 크게 벗어나지 않았습니다.\n처음 가는 분이라면 욕심내서 많이 시키기보다 핵심 메뉴부터 차근히 경험하는 방식이 가장 효율적이었습니다.`,
            `방문동기\n최근 일정이 빡빡해서 오래 머무르기보다 식사 동선이 깔끔한 장소가 필요했고, 그래서 이번 방문을 결정했습니다.\n${keywordText}\n실제로 가보니 과하게 포장된 느낌보다는, 기대했던 포인트를 무난하게 충족하는 쪽에 가까웠습니다.`,
            `매장분위기/좌석\n공간은 전체적으로 정돈되어 있었고 좌석 배치가 복잡하지 않아 처음 들어가도 동선 파악이 어렵지 않았습니다.\n${moodHint}\n대화가 필요한 모임도 가능하고, 빠르게 식사하고 이동해야 하는 일정에도 무리가 없는 환경이었습니다.`,
            `메뉴/맛\n주문은 너무 과하게 늘리지 않고 대표 메뉴 위주로 시작했는데, 결과적으로 이 선택이 가장 만족스러웠습니다.\n${menuHint}\n${memo}\n전체적으로 간이 과하거나 자극적이지 않아 끝까지 부담 없이 먹기 좋았고, 재주문 의사가 생길 정도의 안정감은 분명했습니다.`,
            `팁(주차/웨이팅/가격대)\n${waitHint}\n${parkingHint}\n${priceHint}\n저는 인원수에 맞춰 처음부터 주문 상한선을 정해두니 불필요한 추가 주문이 줄어 체감 만족도가 더 좋아졌습니다.`,
            `총평\n이번 방문은 화려한 한 방보다는 기본 완성도가 꾸준히 받쳐주는 경험에 가까웠고, 그래서 오히려 기억에 남았습니다.\n상황에 맞는 시간대와 주문 구성을 미리 정리해두면 체감 품질이 더 또렷하게 올라가고, 동행 만족도도 함께 높아집니다.\n저는 다음에도 비슷한 일정이라면 같은 방식으로 다시 방문할 생각입니다.`
        ].join('\n\n');

        const hashtags = [
            '#방문후기', '#내돈내산', '#솔직리뷰', '#맛집기록', '#일상리뷰',
            '#메뉴추천', '#분위기좋은곳', '#웨이팅팁', '#주차팁', '#가격정보',
            '#재방문의사', '#식사기록', '#동선팁', '#리얼후기', '#블로그후기'
        ].join(' ');

        return `${title}\n\n${fitLength(body, 1200, 2000)}\n\n${hashtags}`;
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
            draftOutput.textContent = draft;
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

    const reviews = JSON.parse(localStorage.getItem('reviews')) || [];

    reviews.forEach(reviewData => {
        const reviewCard = document.createElement('review-card');
        reviewCard.review = reviewData;
        reviewsContainer.appendChild(reviewCard);
    });

    reviewForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const blogUrl = document.getElementById('blog-url').value;
        const rating = document.getElementById('rating').value;
        const reviewText = document.getElementById('review-text').value;

        const newReview = {
            url: blogUrl,
            rating: rating,
            text: reviewText
        };

        const reviewCard = document.createElement('review-card');
        reviewCard.review = newReview;
        reviewsContainer.appendChild(reviewCard);

        reviews.push(newReview);
        localStorage.setItem('reviews', JSON.stringify(reviews));

        reviewForm.reset();
    });
});
