const { default: axios } = require("axios");
const puppeteer = require("puppeteer-extra");
const reCaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
require("dotenv").config();

const { TECH_USERNAME, TECH_PASSWORD, COURSES_LIST, TWO_CAPTCHA_TOKEN } = process.env;

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
    slowMo: 100,
    headless: false,
    // defaultViewport: null,
  })
  .then(async (browser) => {
    const page = await browser.newPage();
    const registered = false;
    const originalCoursesArray = arrayFromCoursesListString(COURSES_LIST);
    const originalCoursesAndPrioritizedGroups = await Promise.all(originalCoursesArray.map(attachGroupLists));

    let unregisteredCoursesArray = originalCoursesArray.slice();
    const coursesAndPrioritizedGroups = originalCoursesArray.slice();

    await page.goto("https://ug3.technion.ac.il/rishum/register");

    await page.setCookie({
      name: "cart",
      value: stringFromCoursesListArray(unregisteredCoursesArray),
      domain: ".technion.ac.il",
    });

    await signIn(page);

    while (!registered && !coursesAndPrioritizedGroups.every(allGroupsTested)) {
      try {
        await page.click(".btn-large");

        await page.waitForSelector(".messages");
        const status = await page.$eval(".messages", (messageDiv) => messageDiv.firstElementChild.innerText);

        // if (status === " הרישום סגור. נסה במועד מאוחר יותר") {
        //   await page.waitForTimeout(3000);
        //   console.log("continuing to try");
        //   continue;
        // }

        await page.goto("https://ug3.technion.ac.il/rishum/weekplan.php?RGS=&SEM=202101");

        const registeredCourses = await page.$$eval(
          ".exam-schedule tr > :first-child.schedule-registered",
          (elements) =>
            elements.map((element) => {
              const {
                groups: { course, priorityGroup },
              } = element.innerHTML.match(/(?<course>\d*)-(?<priorityGroup>\d*)/);

              return { course, priorityGroup };
            })
        );

        if (registeredCourses.length === 5) {
          console.log("~!!!!!!!!&%&^&");
          registered = true;
          continue;
        }

        const registeredCoursesNumbers = registeredCourses.map(({ course }) => course);
        const failedToRegisterCourses = originalCoursesArray.filter(
          (current) => !registeredCoursesNumbers.includes(current.course)
        );

        unregisteredCoursesArray = failedToRegisterCourses.map((failedRegister) => {
          const { course } = failedRegister;
          const currentCourse = coursesAndPrioritizedGroups.find((current) => current.course === course);
          const newPriorityGroup =
            currentCourse.priorityGroups.shift() ?? currentCourse.restOfGroups.shift() ?? currentCourse.priorityGroup;

          currentCourse.priorityGroup = newPriorityGroup;

          return { course, priorityGroup: newPriorityGroup };
        });

        console.log(unregisteredCoursesArray);

        await page.setCookie({
          name: "cart",
          value: stringFromCoursesListArray(unregisteredCoursesArray),
          domain: ".technion.ac.il",
        });

        await page.goto("https://ug3.technion.ac.il/rishum/register");
      } catch (e) {
        console.log(e);
        console.log("in catch");
        await page.waitForTimeout(3000);
        await page.goto("https://ug3.technion.ac.il/rishum/register");
      }
    }
    await Promise.all([page.click(".btn-danger"), page.waitForNavigation()]);
    await browser.close();
    // console.log(
    //   "Registered successfully to the following courses:" + prettyPrintCoursesAndGroups(coursesAndPrioritizedGroups)
    // );
    console.log(coursesAndPrioritizedGroups);
  });

function openNewWindow() {
  return page.goto("https://ug3.technion.ac.il/rishum/register");
}

async function signIn(page) {
  await Promise.all([page.waitForSelector("#username"), page.waitForSelector("#password")]);

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
  return axios
    .get(`https://ug3.technion.ac.il/rishum/course/${courseNumber}/202101`)
    .then((response) =>
      Array.from(response.data.matchAll(/<td class="hide-on-tablet">(\d\d)<\/td>/g)).map((match) => match[1])
    );
}

// structures the groupList by priority
// RETURN: an object containing the priority groups and rest of the groups separately
function getPrioritizedGroupList(groupList, priorityGroupNumber) {
  const priorityStruct = {
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

// gets all groups for course, prioritizes them and attaches them to the course element
// RETURN: same courseElement
async function attachGroupLists(courseElement) {
  const { course, priorityGroup } = courseElement;
  const groupList = await getGroupListForCourse(course);
  const { priorityGroups, restOfGroups } = getPrioritizedGroupList(groupList, priorityGroup);

  courseElement.priorityGroups = priorityGroups;
  courseElement.restOfGroups = restOfGroups;
  return courseElement;
}

// transforms a courses list string into an array
// RETURN: an array with {course, priorityGroup} elements
function arrayFromCoursesListString(coursesListString) {
  const coursesListArray = [];
  for (let i = 0; i < coursesListString.length; i += 8) {
    coursesListArray.push({
      course: coursesListString.slice(i, i + 6),
      priorityGroup: coursesListString.slice(i + 6, i + 8),
    });
  }

  return coursesListArray;
}

// transforms a courses list array into a string
// RETURN: a courses list string
function stringFromCoursesListArray(coursesListArray) {
  return coursesListArray.reduce((str, curr) => str.concat(curr.course + curr.priorityGroup), "");
}

function allGroupsTested(courseAndGroupsElement) {
  console.log(!courseAndGroupsElement.priorityGroups.length && !courseAndGroupsElement.restOfGroups.length);
  return !courseAndGroupsElement.priorityGroups.length && !courseAndGroupsElement.restOfGroups.length;
}
