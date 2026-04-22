const lancedb = require('@lancedb/lancedb');
async function run() {
  const db = await lancedb.connect('../../.kb/lancedb');
  try {
    await db.dropTable('test').catch(() => {});
    const table = await db.createTable('test', [
      { vector: [0.1, 0.2], id: 'a', text: 'hello' }
    ]);
    await table.add([{ vector: [0.3, 0.4], id: 'b', text: 'world' }]);
    await table.delete("id = 'a'");
    const res = await table.search([0.1, 0.2]).limit(1).toArray();
    console.log(res);
  } catch (e) {
    console.error(e);
  }
}
run();
