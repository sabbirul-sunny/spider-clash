(async function () {
  if (IMAGES.hero) {
    $('heroPhoto').style.backgroundImage = `url('${IMAGES.hero}')`;
    $('heroPhoto').innerHTML = '';
  }
  if (new URLSearchParams(location.search).get('banned')) $('banned').hidden = false;
  try {
    const me = await api('/api/auth/me');
    if (me.role === 'team') return (location.href = 'dashboard.html');
    if (me.role === 'admin') return (location.href = 'admin.html');
    if (me.banned) $('banned').hidden = false;
  } catch (e) { /* not logged in */ }

  const showAdmin = (on) => {
    $('teamBox').hidden = on; $('adminForm').hidden = !on;
    $('tabTeam').classList.toggle('on', !on); $('tabAdmin').classList.toggle('on', on);
  };
  $('tabTeam').onclick = () => showAdmin(false);
  $('tabAdmin').onclick = () => showAdmin(true);
  $('sLogin').onclick = () => { $('loginForm').hidden = false; $('regForm').hidden = true; $('sLogin').classList.add('on'); $('sReg').classList.remove('on'); };
  $('sReg').onclick = () => { $('loginForm').hidden = true; $('regForm').hidden = false; $('sReg').classList.add('on'); $('sLogin').classList.remove('on'); };

  async function submit(e, msgId, url, body, dest) {
    e.preventDefault();
    const msg = $(msgId); msg.textContent = '';
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      await api(url, { method: 'POST', body });
      location.href = dest;
    } catch (err) {
      msg.textContent = err.data && err.data.banned ? 'Team Banned. Your team cannot log in or take part.' : err.message;
      if (err.data && err.data.banned) $('banned').hidden = false;
      btn.disabled = false;
    }
  }
  $('loginForm').onsubmit = (e) => submit(e, 'lMsg', '/api/auth/team/login', { teamName: $('lName').value, password: $('lPass').value }, 'dashboard.html');
  $('regForm').onsubmit = (e) => submit(e, 'rMsg', '/api/auth/team/register', { teamName: $('rName').value, members: $('rMembers').value, manager: $('rManager').value, password: $('rPass').value }, 'dashboard.html');
  $('adminForm').onsubmit = (e) => submit(e, 'aMsg', '/api/auth/admin/login', { adminName: $('aName').value, password: $('aPass').value }, 'admin.html');
})();
