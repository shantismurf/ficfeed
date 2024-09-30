require('dotenv').config();

var channels = [];
var sendchannel = '';
var msgurl = `https://discord.com/api/v10/channels/{}/messages?limit=30`;
var getchurl = `https://discord.com/api/v10/guilds/${process.env.GUILD}/channels`;
var seen = new Set();
var chnames = (process.env.CHANNELS ?? '').split(',');
// var ao3session;

async function getmsg(c, i) {
  console.log('Fetching messages: Channel ' + (i + 1) + ' / ' + channels.length + '...');
  var x = await fetch(msgurl.replace('{}', c), {
    method: 'GET',
    headers: {
      'Authorization': `Bot ${process.env.TOKEN}`,
      'Content-Type': 'application/json',
    },
  }).then(e => e.json());
  x = x instanceof Array ? x : [];
  return x.map(x => [x, c]);
}

async function fetchMessages(start) {
  var res = [].concat(...(await Promise.all(channels.map((x, i) =>
    new Promise(y => setTimeout(async () => y(await getmsg(x, i)), i * 6e3))
  ))));

  var newmsg = res.filter(msg => !seen.has(msg[0].id)).map(msg => {
    return msg.concat([(msg[0].content.match(/archiveofourown.org\/works\/\d{1,12}/g) ?? [])[0]]);
  }).filter(x => x[2] != undefined).sort((a, b) => new Date(a[0].timestamp).getTime() - new Date(b[0].timestamp).getTime());
  var to = -1;
  newmsg.forEach(async msg => {
    seen.add(msg[0].id);
    if (!start) {

      var ao3 = await ao3api('https://' + msg[2] + '/');
      to++;
      console.log('New Message:', msg[0].content);
      setTimeout(() =>
        fetch(msgurl.replace('{}', sendchannel), {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${process.env.TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
						ao3.error ? {
							embeds: [{
                title: 'Work data can not be retrived. Click here to see work.',
                url: `https://${msg[2]}/`,
                description:
                  `Posted by <@${msg[0].author.id}> in https://discord.com/channels/${process.env.GUILD}/${msg[1]}/${msg[0].id}`,
                color: 0xFF0000,
              }]
						} :
            {
              embeds: [{
                title: ao3.title,
                url: `https://${msg[2]}/`,
                description:
                  `Posted by <@${msg[0].author.id}> in https://discord.com/channels/${process.env.GUILD}/${msg[1]}/${msg[0].id}`,
                color: ({
                  "Not Rated": 0x808080, "General Audiences": 0x0000FF,
                  "Teen And Up Audiences": 0x008000, "Mature": 0xFFA500, "Explicit": 0xFF0000
                })[ao3.rating],
                author: {
                  name: 'A Work by ' + ao3.author,
                  url: ao3.authorlink,
                },
                fields: [
                  {
                    name: 'Published | Updated',
                    value: (ao3.published + ' | ' + (ao3.status ?? 'Never')).substring(0, 1024),
                    inline: true
                  },
                  {
                    name: 'Words | Chapters',
                    value: (ao3.words + ' | ' + ao3.chapters).substring(0, 1024),
                    inline: true,
                  },
                  {
                    name: 'Rating | Warning',
                    value: (ao3.rating + ' | ' + ao3.warning).substring(0, 1024),
                    // inline: true,
                  },
                  {
                    name: 'Tags',
                    value: (ao3.freeform ?? 'None').substring(0, 1024),
                    inline: true,
                  },
                  {
                    name: 'Summary',
                    value: (ao3.summary ?? 'None').substring(0, 1024),
                    // inline: true,
                  },
                ],
                footer: {
                  text: ('Hits: ' + ao3.hits + '\nKudos: ' + (ao3.kudos ?? 0) +
                    '\nComments: ' + (ao3.comments ?? 0)).substring(0, 1024)
                }
              }]
            }
          ),
        }).then(e => e.json()).then(e => e.code ? console.log(JSON.stringify(e)) : ''),
        to * 5e3);

    }
  });
  if (start)
    console.log('Ready!');
  setTimeout(fetchMessages, 60e3);
  return res;
}

async function getch() {
  console.log('Fetching channels...');
  var res = await fetch(getchurl, {
    method: 'GET',
    headers: {
      'Authorization': `Bot ${process.env.TOKEN}`,
      'Content-Type': 'application/json'
    }
  }).then(x => x.json());
  res = res.filter(x => x.type == 0);
  sendchannel = res.splice(res.findIndex(x => x.name == process.env.FEED), 1)[0].id;
  channels = res.filter(x => chnames[0] == '' ? true : chnames.includes(x.name)).map(x => x.id);
  // console.log('Signing in...');
  // ao3session = await fetch("https://archiveofourown.org/users/login", {
  //   headers: {
  //     "content-type": "application/x-www-form-urlencoded",
  //   },
  //   body: "user%5Blogin%5D=${process.env.USERNAME}&user%5Bpassword%5D=${process.env.PASSWORD}&commit=Log+In",
  //   method: "POST"
  // }).then(e => e.headers.get('set-cookie').match(/_otwarchive_session=.*?;/)[0]);
  return;
}

async function ao3api(link) {
  try {
    var res = await fetch(link, /*{ headers: { cookie: ao3session + ' user_credentials=1;' } }*/).then(e => e.text());
    if (!res)
      return {error: true};
    var cur;
    var v = {};
    var rx = /<dd class="(.*?)(?<!stats)( tags)?">(.*?)<\/dd>/gs;
    while (cur = rx.exec(res)) {
      var ry = /(?<=<a class="tag" href=".*?">).*?(?=<\/a>)/gs;
      var ml = [];
      var m = '';
      var i = 0;
      while ((m = ry.exec(cur[3])) && i++ < 1000)
        ml.push(m);
      if (ml.length == 0)
        ml = [cur[3]];
      v[cur[1]] = ml.join(', ').replaceAll('&#39;', "'");
    };
    v.title = res.match(/(?<=<h2 class="title heading">\n).*?(?=\n<\/h2>)/s)[0];
    v.author = res.match(/(?<=<a rel="author" href=".*?">).*?(?=<\/a>)/s)[0];
    v.authorlink = 'https://archiveofourown.org' + res.match(/(?<=<a rel="author" href=").*?(?=">)/s)[0];
    v.summary = res.match(/(?<=<blockquote class="userstuff">).*?(?=<\/blockquote>)/s)[0]
      .replace(/<p>(.*?)<\/p>/gs, (_, y) => y + '\n').replace(/<i>(.*?)<\/i>/gs, (_, y) => '*' + y + '*')
      .replace(/<b>(.*?)<\/b>/gs, (_, y) => '**' + y + '**').replace(/<\/br>/gs, (_, y) => '\n')
      .replace(/^\n(.*)\n\n$/gs, (_, y) => y);
    v.published = v['stats">\n\n<dl class="stats"><dt class="published'].match(/(?<=">).*?$/)[0];
    delete v['stats">\n\n<dl class="stats"><dt class="published'];
    return v;
  } catch (e) {
    return {error: true};
  }
}

getch().then(() => {
  fetchMessages(true);
});

setInterval(getch, 3600e3 * 12)

/*
link v x
sender v x
message link v x
title v x
author v x
summary v x
rating v x
warning v x
tags (freeform) v x
publish / updated v x
words v x
chapters v x
comments / kudos / hits v x
*/

process.on('uncaughtException', (e) => {
  console.error(e);
}).on('unhandledRejection', (e) => {
  console.error(e);
});
