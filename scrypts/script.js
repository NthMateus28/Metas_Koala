async function fetchNotasFiscais() {
    const url = 'http://localhost:3000/api/nfe';
  
    try {
      const response = await fetch(url);
      const result = await response.json();
  
      const notas = result.data;
  
      const promises = notas.map(nfe => fetchDetalhesNotaComRetry(nfe.id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Erro ao buscar dados do backend:', error);
    }
  }
  
  async function fetchDetalhesNotaComRetry(idNota, tentativa = 1) {
    const maxTentativas = 10;
    const delayMs = 20000;
  
    try {
      const response = await fetch(`http://localhost:3000/api/nfe/${idNota}`);
  
      if (response.status === 429) {
        console.warn(`⚠️ Nota ${idNota} recebeu 429 (Too Many Requests). Tentativa ${tentativa}/${maxTentativas}`);
  
        if (tentativa < maxTentativas) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return fetchDetalhesNotaComRetry(idNota, tentativa + 1);
        } else {
          console.error(`❌ Nota ${idNota} excedeu número de tentativas após erro 429`);
          return;
        }
      }
  
      if (!response.ok) {
        console.warn(`Nota ${idNota} não encontrada. Status: ${response.status}`);
        return;
      }
  
      const result = await response.json();
      renderItensNota(result.data);
    } catch (error) {
      console.error(`Erro ao buscar detalhes da nota ${idNota}:`, error);
    }
  }
  
  function renderItensNota(nfe) {
    const tbody = document.querySelector('#salesTable tbody');
  
    nfe.itens.forEach(item => {
      const row = document.createElement('tr');
  
      row.innerHTML = `
        <td>${nfe.id}</td>
        <td>${nfe.contato.nome}</td>
        <td>${nfe.contato.numeroDocumento}</td>
        <td>${new Date(nfe.dataEmissao).toLocaleDateString()}</td>
        <td>${nfe.numero}</td>
        <td>${nfe.contato.endereco.municipio}</td>
        <td>${nfe.contato.endereco.uf}</td>
        <td>${item.codigo}</td>
        <td>${item.descricao}</td>
        <td>${item.quantidade}</td>
        <td>R$ ${item.valor.toFixed(2)}</td>
      `;
  
      tbody.appendChild(row);
    });
  }
  
  // Executa ao carregar a página
  fetchNotasFiscais();
  