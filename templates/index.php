<?php
/** @var \OCP\IL10N $l */
/** @var array $_ */
\OCP\Util::addStyle('feature_voting', 'style');
?>
<div id="app">
    <div id="app-navigation-vue"></div>
    <div id="app-content-vue">
        <div class="fv-container">
            <header class="fv-header">
                <h1><?php p($l->t('Feature Voting')); ?></h1>
                <p class="fv-subtitle"><?php p($l->t('Submit ideas and vote for the features you want most.')); ?></p>
            </header>

            <section class="fv-submit-form">
                <h2><?php p($l->t('Suggest a Feature')); ?></h2>
                <form id="fv-form">
                    <input
                        type="text"
                        id="fv-title"
                        placeholder="<?php p($l->t('Feature title (required)')); ?>"
                        maxlength="255"
                        required
                    />
                    <textarea
                        id="fv-description"
                        placeholder="<?php p($l->t('Describe the feature (optional)')); ?>"
                        rows="3"
                    ></textarea>
                    <button type="submit" class="button primary"><?php p($l->t('Submit')); ?></button>
                </form>
                <p id="fv-form-error" class="fv-error" style="display:none;"></p>
            </section>

            <section class="fv-list-section">
                <h2><?php p($l->t('Feature Requests')); ?> <span id="fv-count" class="fv-count"></span></h2>
                <div id="fv-loading" class="fv-loading"><?php p($l->t('Loading…')); ?></div>
                <ul id="fv-list" class="fv-list"></ul>
                <p id="fv-empty" class="fv-empty" style="display:none;"><?php p($l->t('No feature requests yet. Be the first!')); ?></p>
            </section>
        </div>
    </div>
</div>

<template id="fv-item-tpl">
    <li class="fv-item" data-id="">
        <div class="fv-vote-block">
            <button class="fv-vote-btn" title="Vote">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 4l8 8H4z"/></svg>
            </button>
            <span class="fv-vote-count">0</span>
        </div>
        <div class="fv-content">
            <strong class="fv-item-title"></strong>
            <p class="fv-item-desc"></p>
            <small class="fv-item-meta"></small>
        </div>
        <button class="fv-delete-btn" title="Delete" style="display:none;">&#x2715;</button>
    </li>
</template>

<script>
(function () {
    const BASE = OC.generateUrl('/apps/feature_voting');
    const currentUser = '<?php p(\OC::$server->getUserSession()->getUser()->getUID()); ?>';
    let votedIds = new Set();

    async function apiFetch(path, opts = {}) {
        const res = await fetch(BASE + path, {
            headers: {
                'requesttoken': OC.requestToken,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            ...opts,
        });
        return res.json();
    }

    function renderList(features) {
        const list = document.getElementById('fv-list');
        const empty = document.getElementById('fv-empty');
        const count = document.getElementById('fv-count');
        list.innerHTML = '';
        count.textContent = features.length ? `(${features.length})` : '';

        if (!features.length) {
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';

        const tpl = document.getElementById('fv-item-tpl').content;
        features.forEach(f => {
            const node = document.importNode(tpl, true);
            const li = node.querySelector('.fv-item');
            li.dataset.id = f.id;
            li.querySelector('.fv-item-title').textContent = f.title;
            li.querySelector('.fv-item-desc').textContent = f.description || '';
            li.querySelector('.fv-item-meta').textContent =
                `${f.userId} · ${new Date(f.createdAt).toLocaleDateString()}`;
            li.querySelector('.fv-vote-count').textContent = f.voteCount;

            const voteBtn = li.querySelector('.fv-vote-btn');
            if (votedIds.has(f.id)) li.classList.add('fv-voted');
            voteBtn.addEventListener('click', () => handleVote(f.id, li));

            const delBtn = li.querySelector('.fv-delete-btn');
            if (f.userId === currentUser) {
                delBtn.style.display = '';
                delBtn.addEventListener('click', () => handleDelete(f.id));
            }

            list.appendChild(node);
        });
    }

    async function loadFeatures() {
        document.getElementById('fv-loading').style.display = '';
        const data = await apiFetch('/features');
        document.getElementById('fv-loading').style.display = 'none';
        votedIds = new Set(data.votedIds || []);
        renderList(data.features || []);
    }

    async function handleVote(featureId, li) {
        const data = await apiFetch(`/features/${featureId}/vote`, { method: 'POST' });
        if (data.error) return;
        const countEl = li.querySelector('.fv-vote-count');
        const current = parseInt(countEl.textContent, 10);
        if (data.voted) {
            votedIds.add(featureId);
            li.classList.add('fv-voted');
            countEl.textContent = current + 1;
        } else {
            votedIds.delete(featureId);
            li.classList.remove('fv-voted');
            countEl.textContent = current - 1;
        }
    }

    async function handleDelete(featureId) {
        if (!confirm('<?php p($l->t('Delete this feature request?')); ?>')) return;
        const data = await apiFetch(`/features/${featureId}`, { method: 'DELETE' });
        if (!data.error) loadFeatures();
    }

    document.getElementById('fv-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('fv-title').value.trim();
        const description = document.getElementById('fv-description').value.trim();
        const errEl = document.getElementById('fv-form-error');
        errEl.style.display = 'none';

        const data = await apiFetch('/features', {
            method: 'POST',
            body: JSON.stringify({ title, description }),
        });

        if (data.error) {
            errEl.textContent = data.error;
            errEl.style.display = '';
            return;
        }

        document.getElementById('fv-title').value = '';
        document.getElementById('fv-description').value = '';
        loadFeatures();
    });

    loadFeatures();
})();
</script>
