// Global state for modal
let currentModalProjectId = null;
let currentModalIndex = 0;
let allProjects = [];
let currentModalType = 'image';

function openUpload(){
    document.getElementById('uploadPopup').style.display = 'flex';
}

function closeUpload(){
    document.getElementById('uploadPopup').style.display = 'none';
    const form = document.getElementById('uploadForm');
    if(form) form.reset();
    const previewContainer = document.getElementById('previewContainer');
    if(previewContainer) previewContainer.innerHTML = '';
}

// drag & drop helpers
function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }
function highlight(e){ e.currentTarget.classList.add('highlight'); }
function unhighlight(e){ e.currentTarget.classList.remove('highlight'); }

function handleDrop(e){
    const dt = e.dataTransfer;
    const files = dt.files;
    if(files.length) {
        const file = files[0];
        const input = document.getElementById('mediaInput');
        input.files = files;
        handleFile(file);
    }
}

function handleFile(file) {
    const container = document.getElementById('previewContainer');
    container.innerHTML = '';
    if (!file) return;

    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
        const vid = document.createElement('video');
        vid.src = url;
        vid.controls = true;
        vid.muted = true;
        vid.loop = true;
        vid.style.maxWidth = '100%';
        container.appendChild(vid);
    } else {
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        container.appendChild(img);
    }
}

function openMediaModal(src, projectId, type) {
    const modal = document.getElementById('mediaModal');
    const imgEl = document.getElementById('modalImg');
    const vidEl = document.getElementById('modalVideo');
    if (!modal) return;

    currentModalProjectId = projectId;
    currentModalType = type;

    if (type === 'video') {
        imgEl.style.display = 'none';
        vidEl.style.display = 'block';
        vidEl.src = src;
        vidEl.play().catch(()=>{});
    } else {
        vidEl.pause();
        vidEl.style.display = 'none';
        imgEl.style.display = 'block';
        imgEl.src = src;
    }

    modal.classList.add('active');
    allProjects = Array.from(document.querySelectorAll('.card'));
    currentModalIndex = allProjects.findIndex(p => parseInt(p.getAttribute('data-project-id')) === projectId);
    updateModalLikeButton(projectId);
}

function closeMediaModal() {
    const modal = document.getElementById('mediaModal');
    if (modal) {
        modal.classList.remove('active');
        currentModalProjectId = null;
        const vidEl = document.getElementById('modalVideo');
        if (vidEl) vidEl.pause();
    }
}

function prevMedia(){
    allProjects = Array.from(document.querySelectorAll('.card'));
    currentModalIndex = (currentModalIndex - 1 + allProjects.length) % allProjects.length;
    const card = allProjects[currentModalIndex];
    const type = card.getAttribute('data-filetype');
    const projectId = parseInt(card.getAttribute('data-project-id'));
    const src = type === 'video' ? card.querySelector('video source').src : card.querySelector('img').src;
    openMediaModal(src, projectId, type);
}

function nextMedia(){
    allProjects = Array.from(document.querySelectorAll('.card'));
    currentModalIndex = (currentModalIndex + 1) % allProjects.length;
    const card = allProjects[currentModalIndex];
    const type = card.getAttribute('data-filetype');
    const projectId = parseInt(card.getAttribute('data-project-id'));
    const src = type === 'video' ? card.querySelector('video source').src : card.querySelector('img').src;
    openMediaModal(src, projectId, type);
}

function updateModalLikeButton(projectId) {
    const heartBtn = document.getElementById('modalHeartBtn');
    const likeCount = document.getElementById('modalLikeCount');
    const cardLikeCount = document.querySelector(`.like-count[data-project-id="${projectId}"]`);
    if (cardLikeCount) likeCount.textContent = cardLikeCount.textContent;
    const cardHeartBtn = document.querySelector(`.heart-btn[data-project-id="${projectId}"]`);
    if (cardHeartBtn && cardHeartBtn.classList.contains('liked')) {
        heartBtn.classList.add('liked');
    } else {
        heartBtn.classList.remove('liked');
    }
}

function toggleLike(event, projectId){
    event.stopPropagation();
    const heartBtn = event.currentTarget;
    fetch(`/api/like/${projectId}`,{method:'POST'})
    .then(r=>r.json())
    .then(data=>{
        const likeCount = document.querySelector(`.like-count[data-project-id="${projectId}"]`);
        if(likeCount) likeCount.textContent = data.likes;
        heartBtn.classList.toggle('liked');
        const heartIcon = heartBtn.querySelector('.heart-icon');
        if(data.liked){ heartIcon.classList.replace('far','fas'); }
        else { heartIcon.classList.replace('fas','far'); }
        if(currentModalProjectId===projectId) updateModalLikeButton(projectId);
    }).catch(console.error);
}

function toggleSave(event, projectId){
    event.stopPropagation();
    const saveBtn = event.currentTarget;
    const isSaved = saveBtn.getAttribute('data-saved')==='true';
    if(isSaved){ saveBtn.classList.remove('saved'); saveBtn.setAttribute('data-saved','false'); }
    else { saveBtn.classList.add('saved'); saveBtn.setAttribute('data-saved','true'); }
}

function toggleModalLike(event){
    event.stopPropagation();
    if(currentModalProjectId) toggleLike(event,currentModalProjectId);
}

function filterProjects(){
    const searchInput = document.getElementById('searchInput');
    const navbarSearchInput = document.getElementById('navbarSearchInput');
    const term = (searchInput && searchInput.value)?searchInput.value.toLowerCase():'';
    if(searchInput&&navbarSearchInput && searchInput.value!==navbarSearchInput.value){ navbarSearchInput.value=searchInput.value; }
    document.querySelectorAll('.card').forEach(card=>{
        const title = card.getAttribute('data-project-title');
        card.style.display = title.includes(term)?'':'none';
    });
}

function deleteProject(projectId){
    if(confirm('Are you sure you want to delete this project?')){
        window.location.href='/delete/'+projectId;
    }
}

function toggleNavbarSearch(){
    const searchBar = document.getElementById('navbarSearchBar');
    if(searchBar){
        const hidden = searchBar.style.display==='none';
        searchBar.style.display = hidden?'flex':'none';
        if(hidden) document.getElementById('navbarSearchInput').focus();
    }
}

function closeNavbarSearch(){
    const searchBar = document.getElementById('navbarSearchBar');
    if(searchBar){ searchBar.style.display='none'; document.getElementById('navbarSearchInput').value=''; filterProjects(); }
}

// utility to attach hover autoplay behaviour to videos marked with .video-preview
function setupCardHoverVideos(){
    document.querySelectorAll('.video-preview').forEach(video => {
        const card = video.closest('.card');
        if(!card) return;
        card.addEventListener('mouseenter', () => {
            video.play().catch(()=>{});
        });
        card.addEventListener('mouseleave', () => {
            video.pause();
            video.currentTime = 0;
        });
    });
}

window.addEventListener('DOMContentLoaded',()=>{
    const mediaInput = document.getElementById('mediaInput');
    if(mediaInput){
        mediaInput.addEventListener('change', e=>handleFile(e.target.files[0]));
    }
    const dropArea = document.getElementById('dropArea');
    if(dropArea){
        ['dragenter','dragover','dragleave','drop'].forEach(evt=>{
            dropArea.addEventListener(evt,preventDefaults,false);
        });
        ['dragenter','dragover'].forEach(evt=>{
            dropArea.addEventListener(evt,highlight,false);
        });
        ['dragleave','drop'].forEach(evt=>{
            dropArea.addEventListener(evt,unhighlight,false);
        });
        dropArea.addEventListener('drop',handleDrop,false);
    }

    const uploadForm = document.getElementById('uploadForm');
    if(uploadForm){
        uploadForm.addEventListener('submit', function(e){
            const titleInput = document.getElementById('titleInput');
            const mediaInput = document.getElementById('mediaInput');
            if(!titleInput.value.trim() || !mediaInput.files[0]){
                e.preventDefault();
                alert('Please enter a title and select a file');
                return;
            }
        });
    }

    const searchInput = document.getElementById('searchInput');
    if(searchInput){ searchInput.addEventListener('keyup', filterProjects); }
    const navbarSearchInput = document.getElementById('navbarSearchInput');
    if(navbarSearchInput){
        navbarSearchInput.addEventListener('keyup',()=>{ const main = document.getElementById('searchInput'); if(main){ main.value=navbarSearchInput.value; } filterProjects(); });
    }

    document.addEventListener('keydown',(e)=>{
        const modal = document.getElementById('mediaModal');
        if(modal && modal.classList.contains('active')){
            if(e.key==='ArrowLeft') prevMedia();
            if(e.key==='ArrowRight') nextMedia();
            if(e.key==='Escape') closeMediaModal();
        }
    });

    // after DOM is ready, attach hover handlers to video cards
    setupCardHoverVideos();

    // clicking a card anywhere (except on buttons) should open the modal
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => {
            const type = card.getAttribute('data-filetype');
            const projectId = parseInt(card.getAttribute('data-project-id'));
            let src = '';
            if (type === 'video') {
                const sourceEl = card.querySelector('video source');
                if (sourceEl) src = sourceEl.src;
            } else {
                const imgEl = card.querySelector('img');
                if (imgEl) src = imgEl.src;
            }
            if (src) openMediaModal(src, projectId, type);
        });
    });

    // attach save button handlers
    document.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const card = btn.closest('.card');
            if (!card) return;
            const pid = parseInt(card.getAttribute('data-project-id'));
            toggleSave(e, pid);
        });
    });
});
