import fetch from 'node-fetch';

export async function atualizarNotasCompletas() {
  try {
    console.log('🔄 Buscando novas notas fiscais...');

    // 1. Buscar lista geral de notas
    const url = 'http://localhost:3000/api/nfe';
    const res = await fetch(url);
    const { data: notas } = await res.json();

    // 2. Obter cache atual
    const cacheRes = await fetch('http://localhost:3000/api/nfe-cache');
    const cacheAtual = await cacheRes.json();

    // 3. Identificar notas ainda não detalhadas
    const idsRestantes = notas
      .map(nf => nf?.id)
      .filter(id => id && !cacheAtual[id]);

    console.log(`🧾 ${idsRestantes.length} notas novas para detalhar`);

    // 4. Buscar detalhes com validação
    const novosDetalhes = [];
    let erros = 0;
    let redirects = 0;

    for (const id of idsRestantes) {
      try {
        const resposta = await fetch(`http://localhost:3000/api/nfe/${id}`);
        const status = resposta.status;

        if (status === 302) {
          redirects++;
          console.warn(`↪️ Nota ${id} redirecionada (302), ignorada`);
          continue;
        }

        const contentType = resposta.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          erros++;
          console.warn(`⚠️ Nota ${id} não retornou JSON. Tipo: ${contentType}`);
          continue;
        }

        const detalhe = await resposta.json();
        if (detalhe?.data?.id) {
          novosDetalhes.push(detalhe);
          console.log(`✅ Detalhe da nota ${id} carregado`);
        } else {
          erros++;
          console.warn(`⚠️ Detalhe da nota ${id} sem estrutura válida`);
        }
      } catch (e) {
        erros++;
        console.error(`❌ Erro ao buscar detalhe da nota ${id}:`, e.message);
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // pausa para respeitar limite
    }

    // 5. Atualizar cache
    if (novosDetalhes.length > 0) {
      await fetch('http://localhost:3000/api/nfe-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novosDetalhes)
      });
      console.log(`🗃️ Cache atualizado com ${novosDetalhes.length} novas notas`);
    } else {
      console.log('📭 Nenhuma nota detalhada foi adicionada');
    }

    // 6. Resumo
    console.log(`🔚 Finalizado: ${novosDetalhes.length} salvas, ${redirects} 302, ${erros} erros`);
  } catch (err) {
    console.error('🔥 Erro geral ao atualizar notas:', err);
  }
}
