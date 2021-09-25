const puppeteer = require("puppeteer");
const reCaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
require("dotenv").config();

const { TECH_USERNAME, TECH_PASSWORD, COURSES_LIST, TWO_CAPTCHA_TOKEN } =
  process.env;

puppeteer.use(
  reCaptchaPlugin({
    provider: {
      id: "2captcha",
      token: TWO_CAPTCHA_TOKEN,
    },
    visualFeedback: true,
  })
);

puppeteer
  .launch({
    // slowMo: 100,
    headless: false,
    // defaultViewport: null,
  })
  .then(async (browser) => {
    const page = await browser.newPage();
    const registered = false;

    await page.goto("https://ug3.technion.ac.il/rishum/register");

    page.setCookie({ name: "cart", value: COURSES_LIST });

    await signIn(page);

    while (!registered) {
      try {
        await page.click(".btn-large");

        await page.waitForSelector(".messages");

        await page.goto(
          "https://ug3.technion.ac.il/rishum/weekplan.php?RGS=&SEM=202101"
        );

        const registeredCourses = await page.$$("table .schedule-registered");
        console.log(registeredCourses.length);

        if (registeredCourses.length === 18) {
          registered = true;
        }

        // const status = await page.$eval(
        //   ".messages",
        //   (messageDiv) => messageDiv.firstElementChild.innerText
        // );

        // console.log(`**${status.split("").reverse().join("")}**`);

        // await Promise.all([
        //   page.click(".btn-danger"),
        //   page.waitForNavigation(),
        // ]);
      } catch (e) {
        console.log(e);
        console.log("in catch");
        await page.waitForTimeout(3000);
        await page.goto("https://ug3.technion.ac.il/rishum/register");
      }

      // await Promise.all([page.click(".btn-danger"), page.waitForNavigation()]);
      // await browser.close();
    }
  });

function openNewWindow() {
  return page.goto("https://ug3.technion.ac.il/rishum/register");
}

async function signIn(page) {
  await Promise.all([
    page.waitForSelector("#username"),
    page.waitForSelector("#password"),
  ]);

  await page.type("#username", TECH_USERNAME);
  await page.type("#password", TECH_PASSWORD);

  const { solved } = await page.solveRecaptchas();
  console.log(`captcha solved? ${solved[0].isSolved}`);

  if (!solved.length) {
    console.log("captcha failed");
    await page.waitForTimeout(3000);
    await browser.close();
  }

  await Promise.all([page.click("[type=submit]"), page.waitForNavigation()]);
}

// fetches a list of all available groups for a course.
// RETURN: a promise that fulfils with the list (empty list if courseNumber doesn't exists)
function getGroupListForCourse(courseNumber) {
  return fetch(
    `https://ug3.technion.ac.il/rishum/course/${courseNumber}/202101`
  )
    .then((response) => response.json())
    .then((html) =>
      Array.from(html.matchAll(/<td class="hide-on-tablet">(\d\d)<\/td>/g)).map(
        (match) => match[1]
      )
    );
}

// structures the groupList by priority
// RETURN: an object containing the priority groups and rest of the groups separately
function prioritizeGroupList(groupList, courseNumber, priorityGroupNumber) {
  const priorityStruct = {
    courseNumber,
    priorityGroups: [],
    restOfGroups: [],
  };

  groupList.forEach((current) => {
    if (current === priorityGroupNumber) return;

    if (current[0] === priorityGroupNumber[0]) {
      priorityStruct.priorityGroups.push(current);
    } else {
      priorityStruct.restOfGroups.push(current);
    }
  });

  return priorityStruct;
}
