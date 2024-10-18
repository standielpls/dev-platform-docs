console.info(
  '%cDig into the Zapier Docs!',
  'font-weight: bold; font-size: 1rem; text-shadow: #474747 2px 2px 2px, 2px 1px 1px rgba(255,79,0,0); color: #FFFFFF; background: #FF4F00; padding: 5px; border: 1px solid #ffffff; border-radius: 2px;'
);

fetch('https://zapier.com/api/v4/session', {credentials: 'include'})
  .then(function (response) {
    return response.json();
  })
  .then(function (session) {
    console.info({ session });
  });
