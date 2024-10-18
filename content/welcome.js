console.info(
  '%cDig into the Zapier Docs!',
  'font-weight: bold; font-size: 1rem; text-shadow: #474747 2px 2px 2px, 2px 1px 1px rgba(255,79,0,0); color: #FFFFFF; background: #FF4F00; padding: 5px; border: 1px solid #ffffff; border-radius: 2px;'
);

function replaceWithLogoutNav(name) {
  const loginLinkNode =
    document.querySelector('a[href="https://zapier.com/platform/login"]');

  const ul = loginLinkNode.closest('ul');

  const liName = document.createElement('li');
  liName.appendChild(document.createTextNode(name));

  const liLogout = document.createElement('li');
  liLogout.setAttribute('class', 'whitespace-nowrap hidden lg:flex');
  liLogout.setAttribute('id', 'topbar-cta-button');

  const aLogout = document.createElement('a');
  aLogout.setAttribute('href', 'https://zapier.com/logout');
  aLogout.setAttribute('target', '_blank');
  aLogout.setAttribute('class', 'group px-4 py-1.5 relative inline-flex items-center text-sm font-medium');

  const spanFrame = document.createElement('span');
  spanFrame.setAttribute('class', 'absolute inset-0 bg-primary-dark dark:bg-primary-light/10 border-primary-light/30 rounded-full dark:border group-hover:opacity-[0.9] dark:group-hover:border-primary-light/60');

  const divLogout = document.createElement('div');
  divLogout.setAttribute('class', 'mr-0.5 space-x-2.5 flex items-center');

  const spanLogout = document.createElement('span');
  spanLogout.setAttribute('class', 'z-10 text-white dark:text-primary-light');
  spanLogout.appendChild(document.createTextNode('Logout'))

  aLogout.appendChild(spanFrame);
  divLogout.appendChild(spanLogout)
  aLogout.appendChild(divLogout)
  liLogout.appendChild(aLogout);
  ul.replaceChildren(liName, liLogout);
}

fetch('https://zapier.com/api/v4/session', {credentials: 'include'})
  .then(function (response) {
    return response.json();
  })
  .then(function (session) {
    console.info({ session });

    const {
      first_name: name,
      is_logged_in: isLoggedIn,
      // photo_url: photoUrl,
    } = session;

    if (!isLoggedIn) {
      return;
    }

    replaceWithLogoutNav(name);
  });
