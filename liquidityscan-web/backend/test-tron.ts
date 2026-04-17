async function main() {
    // Valid Binance Cold Wallet for test
    const testWallet = 'TMuA6YqfCeX8MmG4pzM4nmY3h6M7F6Xv';
    const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    const url = `https://api.trongrid.io/v1/accounts/TXc1XN3vY1q1ZqM591r2k4zEHTM6iG2e4v/transactions/trc20?contract_address=${usdtContract}&limit=2`; // Just using a random active trace address

    console.log(`Fetching ${url}...`);
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

main();
