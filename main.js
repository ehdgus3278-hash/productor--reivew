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

    const buildSearchSummary = (items) => {
        if (!items.length) {
            return '검색 결과가 없거나 아직 검색하지 않았습니다.';
        }

        const selected = items.slice(0, 3).map((item) => {
            const title = cleanText(item.title);
            const description = cleanText(item.description);
            const blogger = cleanText(item.bloggername);
            const postDate = cleanText(item.postdate);
            return `- ${title} (${blogger}, ${postDate}) : ${description}`;
        });

        return selected.join('\n');
    };

    const buildDraft = (items, reviewText) => {
        const summaryBlock = buildSearchSummary(items);
        const cleanReview = reviewText.trim() || '직접 작성한 후기가 아직 없습니다. 경험을 기반으로 자유롭게 보강해 주세요.';

        return [
            '한줄요약',
            '간단한 결론을 한 줄로 정리해 주세요.',
            '',
            '방문동기',
            summaryBlock,
            '',
            '분위기',
            cleanReview,
            '',
            '메뉴',
            '검색 내용과 실제 경험을 바탕으로 메뉴 특징을 정리해 주세요.',
            '',
            '팁',
            '대기시간/추천 시간대/좌석 팁 등 실전 정보를 적어 주세요.',
            '',
            '총평',
            cleanReview,
            '',
            '해시태그',
            '#맛집 #후기 #리뷰'
        ].join('\n');
    };

    const updateDraft = () => {
        const reviewText = userReview.value;
        const draft = buildDraft(latestSearchItems, reviewText);
        draftOutput.textContent = draft;
    };

    userReview.value = localStorage.getItem(USER_REVIEW_KEY) || '';
    userReview.addEventListener('input', () => {
        localStorage.setItem(USER_REVIEW_KEY, userReview.value);
    });

    generateButton.addEventListener('click', () => {
        updateDraft();
        setDraftStatus('후기 초안이 생성되었습니다.', false);
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
