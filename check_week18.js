import axios from 'axios';

async function checkWeek18() {
    try {
        console.log("Fetching Week 18...");
        const res = await axios.get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=18');
        const events = res.data.events || [];
        console.log(`Week 18 Events Found: ${events.length}`);
        if (events.length > 0) {
            console.log("Sample Event:", events[0].name);
            console.log("Date:", events[0].date);
            console.log("Status:", events[0].status.type.completed);
        } else {
            console.log("No events found. Checking season type.");
            // Maybe season type 2 (regular) only has 18 weeks? Yes.
            // Maybe the API needs `seasontype=2`? It usually defaults.
        }
    } catch (e) {
        console.error(e.message);
    }
}

checkWeek18();

