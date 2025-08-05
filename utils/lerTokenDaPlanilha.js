import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho até as credenciais da service account
const keyFile = path.join(__dirname, '..', 'credenciais-service-account.json');

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const spreadsheetId = '1wBiU07l5or7UFYMHByCG81urCcDDwa6vpLFNCQ3iAl4';
const range = 'CONFIG!B2';

export async function lerTokenDaPlanilha() {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    const token = response.data.values?.[0]?.[0];
    if (!token) throw new Error('Token não encontrado na célula CONFIG!B2');

    return token;
  } catch (error) {
    console.error('Erro ao ler token da planilha:', error);
    throw error;
  }
}
